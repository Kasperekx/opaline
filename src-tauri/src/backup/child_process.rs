use std::{io, process::ExitStatus};
use tokio::process::{Child, ChildStderr, ChildStdout, Command};

pub(super) struct OwnedChild {
    // Drop the group guard before Tokio terminates/reaps the leader.
    #[cfg(unix)]
    group: OwnedProcessGroup,
    child: Child,
}

impl OwnedChild {
    pub fn spawn(command: &mut Command) -> io::Result<Self> {
        command.kill_on_drop(true);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
        }
        let child = command.spawn()?;
        Ok(Self {
            #[cfg(unix)]
            group: OwnedProcessGroup::new(child.id())?,
            child,
        })
    }

    pub fn take_stderr(&mut self) -> Option<ChildStderr> {
        self.child.stderr.take()
    }

    pub fn take_stdout(&mut self) -> Option<ChildStdout> {
        self.child.stdout.take()
    }

    pub async fn wait(&mut self) -> io::Result<ExitStatus> {
        #[cfg(unix)]
        {
            // Preserve the leader's PID until group cleanup. Waiting/reaping it first could
            // leave workers behind or let a later signal target a reused process-group ID.
            while !self.group.exited()? {
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
            self.group.terminate();
        }
        let status = self.child.wait().await?;
        #[cfg(unix)]
        {
            self.group.armed = false;
        }
        Ok(status)
    }

    pub async fn terminate(&mut self) -> io::Result<()> {
        #[cfg(unix)]
        self.group.terminate();
        self.child.kill().await?;
        #[cfg(unix)]
        {
            self.group.armed = false;
        }
        Ok(())
    }
}

#[cfg(unix)]
struct OwnedProcessGroup {
    pid: libc::pid_t,
    armed: bool,
}

#[cfg(unix)]
impl OwnedProcessGroup {
    fn new(id: Option<u32>) -> io::Result<Self> {
        let pid = id
            .and_then(|id| libc::pid_t::try_from(id).ok())
            .filter(|pid| *pid > 1)
            .ok_or_else(|| io::Error::other("Cannot identify the client process group."))?;
        let group = Self { pid, armed: false };
        if !group.is_owned() {
            return Err(io::Error::other("Cannot isolate the client process group."));
        }
        Ok(Self { pid, armed: true })
    }

    fn is_owned(&self) -> bool {
        // SAFETY: getpgid/getpgrp have no pointer arguments. process_group(0) created
        // this group. Some systems no longer report getpgid for an exited leader;
        // WNOWAIT still proves it is our unreaped child and its PID cannot be reused.
        let separate_group = unsafe { libc::getpgrp() != self.pid };
        separate_group
            && (unsafe { libc::getpgid(self.pid) == self.pid } || self.exited().unwrap_or(false))
    }

    fn terminate(&self) {
        if self.armed && self.is_owned() {
            // SAFETY: the validated positive PID belongs to our still-unreaped leader.
            // A negative PID signals only its isolated group, never the application's.
            unsafe { libc::kill(-self.pid, libc::SIGKILL) };
        }
    }

    fn exited(&self) -> io::Result<bool> {
        // SAFETY: zero-initialized siginfo_t is a valid writable output buffer. WNOWAIT
        // observes only this owned child's exit without reaping it or releasing its PID.
        let mut status: libc::siginfo_t = unsafe { std::mem::zeroed() };
        let result = unsafe {
            libc::waitid(
                libc::P_PID,
                self.pid as libc::id_t,
                &mut status,
                libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
            )
        };
        if result == -1 {
            let error = io::Error::last_os_error();
            if error.kind() == io::ErrorKind::Interrupted {
                return Ok(false);
            }
            return Err(error);
        }
        // SAFETY: waitid returned successfully and initialized the signal information.
        Ok(unsafe { status.si_pid() } == self.pid)
    }
}

#[cfg(unix)]
impl Drop for OwnedProcessGroup {
    fn drop(&mut self) {
        self.terminate();
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{process::Stdio, time::Duration};
    use tokio::io::{AsyncBufReadExt, BufReader};

    async fn process_tree(exit_early: bool) -> (OwnedChild, libc::pid_t) {
        let mut command = Command::new("/bin/sh");
        command
            .args([
                "-c",
                if exit_early {
                    "/bin/sleep 30 & printf '%s\\n' \"$!\"; exit 7"
                } else {
                    "/bin/sleep 30 & printf '%s\\n' \"$!\"; wait"
                },
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = OwnedChild::spawn(&mut command).unwrap();
        let mut reader = BufReader::new(child.take_stdout().unwrap());
        let mut line = String::new();
        tokio::time::timeout(Duration::from_secs(3), reader.read_line(&mut line))
            .await
            .unwrap()
            .unwrap();
        let worker = line.trim().parse::<libc::pid_t>().unwrap();
        assert!(worker > 1);
        assert_ne!(worker, child.group.pid);
        (child, worker)
    }

    async fn assert_stopped(pid: libc::pid_t) {
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                // SAFETY: signal 0 only probes the synthetic child; it sends no signal.
                if unsafe { libc::kill(pid, 0) } == -1 {
                    assert_eq!(io::Error::last_os_error().raw_os_error(), Some(libc::ESRCH));
                    break;
                }
                #[cfg(target_os = "linux")]
                if std::fs::read_to_string(format!("/proc/{pid}/stat"))
                    .ok()
                    .and_then(|stat| {
                        stat.rsplit_once(") ")
                            .map(|(_, state)| state.starts_with('Z'))
                    })
                    == Some(true)
                {
                    // A container's PID 1 may delay reaping grandchildren; a zombie cannot run.
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("The synthetic client worker was not terminated.");
    }

    #[tokio::test]
    async fn termination_reaps_the_leader_and_stops_its_worker_only() {
        let mut unrelated = Command::new("/bin/sleep")
            .arg("30")
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let (mut child, worker) = process_tree(false).await;
        let leader = child.group.pid;
        tokio::time::timeout(Duration::from_secs(3), child.terminate())
            .await
            .unwrap()
            .unwrap();
        assert!(!child.group.armed);
        assert_stopped(leader).await;
        assert_stopped(worker).await;
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.kill().await.unwrap();
    }

    #[tokio::test]
    async fn dropping_the_waiting_future_stops_the_process_group() {
        let (mut child, worker) = process_tree(false).await;
        let leader = child.group.pid;
        let task = tokio::spawn(async move { child.wait().await });
        tokio::task::yield_now().await;
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_stopped(leader).await;
        assert_stopped(worker).await;
    }

    #[tokio::test]
    async fn failed_leader_does_not_leave_its_worker_running() {
        let (mut child, worker) = process_tree(true).await;
        let status = tokio::time::timeout(Duration::from_secs(3), child.wait())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(status.code(), Some(7));
        assert!(!child.group.armed);
        assert_stopped(worker).await;
    }

    #[tokio::test]
    async fn successful_exit_keeps_its_status() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "exit 0"]);
        let mut child = OwnedChild::spawn(&mut command).unwrap();
        assert!(child.wait().await.unwrap().success());
        assert!(!child.group.armed);
    }
}

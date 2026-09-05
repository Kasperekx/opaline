//! AppKit Quit (Cmd+Q, application menu and Dock) bypasses Tauri ExitRequested.
//! Add only the missing delegate callback; never replace the delegate or an
//! existing implementation. Recheck this bridge when upgrading Tao/Tauri.
//! Upstream: https://github.com/tauri-apps/tauri/issues/9198

use super::ExitState;
use objc2::{
    ffi::class_addMethod,
    runtime::{AnyClass, AnyObject, Imp, Sel},
    sel, Encode, MainThreadMarker,
};
use objc2_app_kit::{NSApplication, NSApplicationTerminateReply};
use std::{
    ffi::CString,
    panic::{catch_unwind, AssertUnwindSafe},
    sync::OnceLock,
};
use tauri::{Emitter, Manager};

// The process has one AppKit application. Keep its handle alive for the callback.
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

pub(crate) fn install(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let main = MainThreadMarker::new().ok_or("Install the exit guard on the main thread")?;
    let application = NSApplication::sharedApplication(main);
    let delegate = application.delegate().ok_or("Missing AppKit delegate")?;
    let object: &AnyObject = (*delegate).as_ref();
    let class = object.class();
    let selector = sel!(applicationShouldTerminate:);
    if class.instance_method(selector).is_some() {
        return Err(
            "AppKit already handles termination; review Opaline's native exit bridge".into(),
        );
    }
    APP.set(app.clone())
        .map_err(|_| "Exit guard already installed")?;
    let encoding = CString::new(format!("{}@:@", NSApplicationTerminateReply::ENCODING))?;
    type Callback =
        extern "C-unwind" fn(&AnyObject, Sel, &NSApplication) -> NSApplicationTerminateReply;
    // SAFETY: AppKit calls this selector with (self, _cmd, NSApplication*) and
    // expects NSUInteger. The typed callback and generated return encoding match
    // that ABI on both supported 64-bit macOS architectures. The runtime owns the
    // class, copies the encoding, and retains no Rust references. We add a missing
    // method on the main thread before interaction, without replacing any method,
    // changing object layout, or changing delegate ownership.
    let installed = unsafe {
        class_addMethod(
            (class as *const AnyClass).cast_mut(),
            selector,
            std::mem::transmute::<Callback, Imp>(should_terminate),
            encoding.as_ptr(),
        )
    };
    if !installed.as_bool() {
        return Err("Could not install the native exit guard".into());
    }
    // Refresh any cached optional delegate selectors using the same delegate.
    application.setDelegate(Some(&delegate));
    Ok(())
}

extern "C-unwind" fn should_terminate(
    _: &AnyObject,
    _: Sel,
    _: &NSApplication,
) -> NSApplicationTerminateReply {
    // Never unwind into AppKit or permit an exit when guard dispatch fails.
    catch_unwind(AssertUnwindSafe(|| {
        let Some(app) = APP.get() else {
            return NSApplicationTerminateReply::TerminateCancel;
        };
        if !app.state::<ExitState>().needs_confirmation() {
            return NSApplicationTerminateReply::TerminateNow;
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        let _ = app.emit("request-app-exit", ());
        // Cancel this native request. Only the frontend's existing save/discard
        // flow can later call exit_application and set ExitState.allowed.
        NSApplicationTerminateReply::TerminateCancel
    }))
    .unwrap_or(NSApplicationTerminateReply::TerminateCancel)
}

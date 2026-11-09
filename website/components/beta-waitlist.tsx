import { ArrowRight, Mail } from "lucide-react";
import styles from "./beta-waitlist.module.css";

export function BetaWaitlist() {
  return (
    <section id="beta" className={styles.section} aria-labelledby="beta-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={`eyebrow ${styles.eyebrow}`}>
            <span className={styles.signal} aria-hidden="true" />
            BETA ACCESS
          </p>
          <h2 id="beta-title">
            Beta sign-ups
            <br />
            <span>open soon.</span>
          </h2>
          <p className={styles.description}>
            We’re preparing the first macOS beta. When registration opens, this
            is where you’ll be able to leave your email for an invitation.
          </p>
        </div>

        <div className={styles.signup}>
          <div className={styles.caption}>
            <span>REGISTRATION IS NOT OPEN YET</span>
            <span aria-hidden="true">↗</span>
          </div>
          <div
            role="group"
            aria-labelledby="beta-email-label"
            aria-describedby="beta-signup-note"
          >
            <label id="beta-email-label" htmlFor="beta-email">
              Email address
            </label>
            <div className={styles.controls}>
              <div className={styles.email}>
                <Mail size={17} aria-hidden="true" />
                <input
                  id="beta-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  aria-describedby="beta-signup-note"
                  disabled
                />
              </div>
              <button
                type="button"
                disabled
                aria-describedby="beta-signup-note"
              >
                Opening soon
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
          <p id="beta-signup-note" className={styles.note}>
            <span aria-hidden="true" />
            Sign-ups open soon. No email addresses are collected yet.
          </p>
        </div>
      </div>
    </section>
  );
}

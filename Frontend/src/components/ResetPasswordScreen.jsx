import { useState } from "react";

import { resetPassword } from "../services/api";


/*
 * Shown when the app opens with a ?reset_token=... in the URL (from the
 * emailed link). Lets the user set a new password.
 *
 * Props:
 *   token   - the reset token from the URL.
 *   onDone  - called to leave this screen (clears the URL + returns to login).
 */
function ResetPasswordScreen({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const passwordChecks = [
    {
      label: "At least 8 characters",
      met: password.length >= 8,
    },
    {
      label: "One letter",
      met: /[a-zA-Z]/.test(password),
    },
    {
      label: "One number",
      met: /[0-9]/.test(password),
    },
  ];

  const passwordValid = passwordChecks.every(
    (check) => check.met,
  );

  async function handleSubmit(event) {
    event.preventDefault();

    if (isLoading || !passwordValid) {
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (submitError) {
      setError(
        submitError.message ||
          "This reset link is invalid or has expired.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-mark">A</div>
          <strong>Aria</strong>
        </div>

        {done ? (
          <>
            <h1 className="auth-title">Password updated</h1>
            <p className="auth-subtitle">
              Your password has been reset. Go back to your previous tab
              and log in with your new password — you can safely close this
              one. Or continue right here.
            </p>

            <button
              type="button"
              className="auth-submit"
              onClick={onDone}
            >
              Log in in this tab
            </button>
          </>
        ) : (
          <>
            <h1 className="auth-title">Set a new password</h1>
            <p className="auth-subtitle">
              Choose a new password for your account.
            </p>

            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field">
                <span>New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>

              <ul className="pw-reqs">
                {passwordChecks.map((check) => (
                  <li
                    key={check.label}
                    className={check.met ? "met" : ""}
                  >
                    <span aria-hidden="true">
                      {check.met ? "✓" : "○"}
                    </span>
                    {check.label}
                  </li>
                ))}
              </ul>

              <button
                type="submit"
                className="auth-submit"
                disabled={isLoading || !passwordValid}
              >
                {isLoading ? "Please wait…" : "Reset password"}
              </button>
            </form>

            <p className="auth-toggle">
              <button type="button" onClick={onDone}>
                Back to log in
              </button>
            </p>
          </>
        )}
      </div>
    </main>
  );
}


export default ResetPasswordScreen;

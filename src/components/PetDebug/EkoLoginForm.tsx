import { LogIn } from 'lucide-react';

interface EkoLoginFormProps {
  loginUsername: string;
  setLoginUsername: (value: string) => void;
  loginPassword: string;
  setLoginPassword: (value: string) => void;
  ekoAuth: {
    login: (username: string, password: string) => Promise<void>;
    isLoading: boolean;
    error: string | null;
  };
}

export function EkoLoginForm({
  loginUsername,
  setLoginUsername,
  loginPassword,
  setLoginPassword,
  ekoAuth,
}: EkoLoginFormProps) {
  return (
    <div className="eko-login-form">
      <div className="eko-login-header">
        <LogIn size={20} />
        <span>Login required for Prod</span>
      </div>
      {ekoAuth.error && (
        <div className="eko-login-error">{ekoAuth.error}</div>
      )}
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await ekoAuth.login(loginUsername, loginPassword);
          setLoginPassword('');
        } catch {
          // Error is handled by ekoAuth.error
        }
      }}>
        <input
          type="text"
          placeholder="Username"
          value={loginUsername}
          onChange={(e) => setLoginUsername(e.target.value)}
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="Password"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button type="submit" disabled={ekoAuth.isLoading || !loginUsername || !loginPassword}>
          {ekoAuth.isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}

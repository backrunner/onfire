import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input } from '@onfire/ui';
import { Turnstile } from '@marsidev/react-turnstile';
import { signIn } from '../api';

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await signIn({ email, password, ...(turnstileToken ? { turnstile: turnstileToken } : {}) } as any);
      const token = (res as any)?.token ?? (res as any)?.sessionToken ?? (res as any)?.session?.token ?? (res as any)?.session?.sessionToken;
      if (token) localStorage.setItem('onfire.session', token);
      onSuccess();
    } catch (err) {
      setError('登录失败，请检查账号或稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg">
        <div className="mb-4 space-y-1 text-center">
          <div className="text-xl font-semibold text-zinc-900">OnFire 客服登录</div>
          <div className="text-sm text-zinc-600">使用 Better Auth 邮箱密码登录</div>
        </div>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-800">邮箱</label>
            <Input required type="email" value={email} onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-zinc-800">密码</label>
            <Input required type="password" value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
          </div>
          {turnstileSiteKey ? (
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-800">安全验证</label>
              <Turnstile siteKey={turnstileSiteKey} onSuccess={(token) => setTurnstileToken(token)} />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              未配置 Turnstile（VITE_TURNSTILE_SITE_KEY），将跳过验证码
            </div>
          )}
          {error && <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</div>}
          <Button className="w-full" type="submit" loading={loading}>
            登录
          </Button>
        </form>
      </div>
    </div>
  );
}


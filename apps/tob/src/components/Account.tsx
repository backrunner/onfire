import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Button, Input, Card } from '@onfire/ui';
import { changePassword } from '../api';

export function Account() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }
    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      setMessage({ type: 'success', text: '密码已更新，下次登录请使用新密码' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: '修改失败，请检查当前密码或稍后重试' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <div className="border-b border-border px-6 py-4">
          <div className="text-lg font-semibold text-foreground">账户安全</div>
          <p className="text-sm text-muted-foreground">更新登录密码。不会提供找回密码入口，请妥善保存。</p>
        </div>
        <form className="space-y-4 p-6" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">当前密码</div>
            <Input required type="password" value={currentPassword} onChange={(e: ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">新密码</div>
            <Input required type="password" value={newPassword} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">确认新密码</div>
            <Input required type="password" value={confirmPassword} onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)} />
          </div>
          {message && (
            <div className={`rounded-md px-3 py-2 text-sm ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
              {message.text}
            </div>
          )}
          <div className="flex items-center justify-end">
            <Button type="submit" loading={loading}>
              更新密码
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}



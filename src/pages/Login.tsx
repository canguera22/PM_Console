import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { parseErrorMessage } from '@/lib/agent-logger';
import productWorkbenchLogo from '@/assets/branding/product_workbench_logo.png';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = (location.state as { from?: string } | null)?.from || '/';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(email.trim(), password);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center">
          <img
            src={productWorkbenchLogo}
            alt="Product Workbench"
            className="h-16 w-auto"
          />
        </div>

        <Card className="w-full">
        <CardHeader>
          <CardTitle>Log In</CardTitle>
          <CardDescription>Sign in to access Product Console</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Log In'}
            </Button>
          </form>

          <p className="mt-4 text-sm text-[#6B7280]">
            Need an account?{' '}
            <Link to="/signup" className="text-[#2563EB] hover:underline">
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

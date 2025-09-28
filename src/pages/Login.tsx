import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      const role = await login(email, password);
      // Navigate based on returned user role
      if (role === 'faculty') {
        navigate('/faculty-dashboard');
      } else if (role === 'student') {
        navigate('/student-dashboard');
      }
      
      toast({
        title: "Success",
        description: "Logged in successfully!"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to login. Please check your credentials.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center p-3 md:p-4">
      <Card className="w-full max-w-sm border-0 bg-white shadow-none rounded-3xl">
        <CardHeader className="text-center p-3 pb-1">
          <CardTitle className="text-lg font-bold">Welcome Back</CardTitle>
          <p className="text-xs text-muted-foreground">Sign in to your account</p>
        </CardHeader>
        <CardContent className="p-2 pt-1">
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email or ID</Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email or ID"
                className="h-9"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="h-9"
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link 
                to="/signup" 
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </Link>
            </p>
            <p className="text-sm">
              <Link to="/reset" className="text-primary hover:underline font-medium">Forgot password?</Link>
            </p>
            <div>
              <Link to="/otp-login" className="text-sm text-primary hover:underline font-medium">Login with OTP</Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
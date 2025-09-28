import Login from './Login';

const Index = () => {
  return (
    <div className="h-dvh relative overflow-hidden flex flex-col bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Decorative blurred blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

      <main className="flex-1 flex">
        <div className="container mx-auto px-4 py-2 md:py-4 my-auto">
          <div className="grid gap-6 md:grid-cols-2 items-center">
          {/* Left: Branding / Hero */}
          <div className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                Live • Smart Attendance Platform
              </div>
              <h1 className="mt-4 text-4xl md:text-5xl font-bold leading-tight">
                Focus, Track, and Attend with Confidence
              </h1>
              <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-prose">
                A unified attendance system for Students, Faculty, Admins, and Super Admins. Secure sign-in, GPS verification, and a distraction-free focus mode.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm font-medium">GPS & Wi‑Fi</div>
                <div className="text-xs text-muted-foreground">Location-verified sessions</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm font-medium">Face Capture</div>
                <div className="text-xs text-muted-foreground">Quick identity snapshot</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm font-medium">Focus Mode</div>
                <div className="text-xs text-muted-foreground">Stay on task with a timer</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-sm font-medium">Real‑time</div>
                <div className="text-xs text-muted-foreground">Live session monitoring</div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </div>
          </div>

          {/* Right: Auth Card (reuse Login component) */}
          <div className="relative -my-6">
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-tr from-primary/20 to-transparent blur-lg" />
            <div className="relative rounded-3xl border-0 bg-white p-0">
              <Login />
            </div>
          </div>
          </div>
        </div>
      </main>

      <footer className="border-t bg-background/60 backdrop-blur">
        <div className="container mx-auto px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
          <div>
            © {new Date().getFullYear()} FocusTrackAttend. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <a className="hover:text-foreground" href="#">Terms</a>
            <a className="hover:text-foreground" href="#">Privacy</a>
            <a className="hover:text-foreground" href="#">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

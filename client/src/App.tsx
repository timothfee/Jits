import { Switch, Route, Router, Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import NotFound from "@/pages/not-found";
import Library from "@/pages/library";
import InstructionalDetail from "@/pages/instructional-detail";
import Instructors from "@/pages/instructors";
import Settings from "@/pages/settings";

function AppRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Library} />
        <Route path="/instructionals/:id" component={InstructionalDetail} />
        <Route path="/instructors" component={Instructors} />
        <Route path="/instructors/:id" component={Instructors} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, AlertCircle } from "lucide-react";

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center dark:bg-slate-950">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Sorry, we couldn’t find the page you’re looking for. It might have been moved or doesn’t exist.
      </p>
      <div className="mt-6">
        <Link to="/dashboard">
          <Button leftIcon={<Home className="w-4 h-4" />}>Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;


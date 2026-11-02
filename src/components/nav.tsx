"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Menu, X, Sun, Moon } from "lucide-react";
import { BRAND } from "@/lib/brand";

export function Nav() {
  const { user, isReviewer, displayName, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const themeToggle = (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );

  if (loading) {
    return (
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-bold text-lg text-primary">{BRAND.name}</Link>
          {themeToggle}
        </div>
      </header>
    );
  }

  const links = user ? (
    <>
      <Link href="/" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Home</Button></Link>
      <Link href="/info" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Info</Button></Link>
      <Link href="/opportunities" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Opportunities</Button></Link>
      <Link href="/submit" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Submit</Button></Link>
      <Link href="/dashboard" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">My Service</Button></Link>
      <Link href="/profile" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Profile</Button></Link>
      <Link href="/help" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Help</Button></Link>
      {isReviewer && (
        <Link href="/admin/dashboard" onClick={() => setOpen(false)}>
          <Button variant="ghost" size="sm">Admin</Button>
        </Link>
      )}
    </>
  ) : (
    <>
      <Link href="/" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Home</Button></Link>
      <Link href="/info" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Info</Button></Link>
      <Link href="/opportunities" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Opportunities</Button></Link>
      <Link href="/help" onClick={() => setOpen(false)}><Button variant="ghost" size="sm">Help</Button></Link>
    </>
  );

  return (
    <header className="border-b bg-card sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-bold text-lg text-primary" aria-label={`${BRAND.name} home`}>{BRAND.name}</Link>

        <nav className="hidden md:flex items-center gap-1">
          {links}
          {user ? (
            <span className="ml-2 text-sm text-muted-foreground">{displayName}</span>
          ) : (
            <Link href="/auth"><Button size="sm">Sign in</Button></Link>
          )}
          {themeToggle}
        </nav>

        <div className="md:hidden flex items-center gap-1">
          {themeToggle}
          <button className="p-2" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t bg-card px-4 py-3 flex flex-col gap-1">
          {links}
          {!user && (
            <Link href="/auth" onClick={() => setOpen(false)}><Button size="sm" className="w-full">Sign in</Button></Link>
          )}
        </div>
      )}
    </header>
  );
}

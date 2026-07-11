"use client";

import { useState } from "react";
import Link from "next/link";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export default function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden bg-black px-4 py-12">
      <div className="stars-bg pointer-events-none absolute inset-0" />
      <div className="absolute top-0 left-0 z-10 h-8 w-8 border-t border-l border-white/30" />
      <div className="absolute top-0 right-0 z-10 h-8 w-8 border-t border-r border-white/30" />
      <div className="absolute bottom-0 left-0 z-10 h-8 w-8 border-b border-l border-white/30" />
      <div className="absolute bottom-0 right-0 z-10 h-8 w-8 border-b border-r border-white/30" />

      <div className="relative z-10 mb-8 text-center">
        <Link
          href="/"
          className="-skew-x-12 inline-block transform font-mono text-3xl font-bold tracking-widest text-white italic"
        >
          RANDO
        </Link>
        <div className="mt-4 flex items-center justify-center gap-2 opacity-50">
          <div className="h-px w-8 bg-white" />
          <span className="font-mono text-[10px] tracking-wider text-white">∞</span>
          <div className="h-px w-8 bg-white" />
        </div>
        <p className="mt-3 font-mono text-[10px] tracking-wider text-white/50">
          {showSignIn ? "AUTH.SIGN_IN" : "AUTH.SIGN_UP"}
        </p>
      </div>
      <div className="relative z-10 w-full max-w-sm border border-white/20 bg-black/60 p-6 backdrop-blur-sm">
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
      </div>
    </div>
  );
}

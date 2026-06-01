"use client";

import { SigninForm } from "@alauda/shared";
import { signIn } from "next-auth/react";

export default function SigninPage() {
  return (
    <SigninForm
      appName="sub-a"
      onSubmit={async (email) => {
        await signIn("resend", { email, redirectTo: "/" });
      }}
    />
  );
}

"use client";
/**
 * Runs once after the user is authenticated.
 * If a referral code was stored in sessionStorage (written by AuthForm when
 * the user visited /sign-up?ref=XXXX), claim it against the logged-in user.
 * Clears sessionStorage regardless of the outcome.
 */
import { useEffect } from "react";

export function ReferralCapture() {
  useEffect(() => {
    const code = sessionStorage.getItem("referral_code");
    if (!code) return;
    sessionStorage.removeItem("referral_code");

    fetch("/api/referral/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => {});
  }, []);

  return null;
}

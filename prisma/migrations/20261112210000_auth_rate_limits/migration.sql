-- A reset code stops working after five wrong guesses.
ALTER TABLE "PasswordResetCode" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;

-- Fixed-window counters for login, sign-up, and password reset rate limits.
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "PK_RateLimit" PRIMARY KEY ("key")
);

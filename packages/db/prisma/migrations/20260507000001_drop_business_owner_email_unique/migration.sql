-- Drop the unique constraint on Business.ownerEmail and replace it with a
-- non-unique lookup index. Reason: one signed-in user (matched by email) can
-- own multiple Reviews businesses (multi-location owners). The @unique
-- constraint produced a P2002 error on the second insert. ownerEmail remains
-- queryable via the new index for the soft-bridge lookup
-- (Business.ownerEmail = currentUser.email).

-- DropIndex
DROP INDEX IF EXISTS "Business_ownerEmail_key";

-- CreateIndex
CREATE INDEX "Business_ownerEmail_idx" ON "Business"("ownerEmail");

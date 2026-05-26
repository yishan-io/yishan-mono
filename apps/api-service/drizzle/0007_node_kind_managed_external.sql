ALTER TABLE "nodes" ADD COLUMN "kind" text DEFAULT 'managed' NOT NULL;
CREATE INDEX "nodes_kind_idx" ON "nodes" USING btree ("kind");

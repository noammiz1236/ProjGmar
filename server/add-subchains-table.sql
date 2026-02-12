-- Add sub_chains table
CREATE TABLE IF NOT EXISTS app2.sub_chains (
    id INTEGER PRIMARY KEY,
    chain_id INTEGER NOT NULL REFERENCES app2.chains(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for sub-chain lookups
CREATE INDEX IF NOT EXISTS idx_sub_chains_chain_id ON app2.sub_chains(chain_id);
CREATE INDEX IF NOT EXISTS idx_sub_chains_name ON app2.sub_chains(name);

-- Update branches table to include sub_chain_id if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'app2' 
                  AND table_name = 'branches' 
                  AND column_name = 'sub_chain_id') THEN
        ALTER TABLE app2.branches 
        ADD COLUMN sub_chain_id INTEGER REFERENCES app2.sub_chains(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add index for sub_chain_id in branches
CREATE INDEX IF NOT EXISTS idx_branches_sub_chain_id ON app2.branches(sub_chain_id);

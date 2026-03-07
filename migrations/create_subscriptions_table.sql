-- Create subscriptions table for Stepmode Premium
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revenuecat_customer_id TEXT,
  plan_type TEXT CHECK (plan_type IN ('monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'free'
    CHECK (status IN ('free', 'active', 'expired', 'cancelled', 'trial', 'billing_issue')),
  entitlement TEXT DEFAULT 'Stepmode Premium',
  product_identifier TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  original_purchase_date TIMESTAMPTZ,
  will_renew BOOLEAN DEFAULT false,
  store TEXT CHECK (store IN ('app_store', 'play_store')),
  environment TEXT DEFAULT 'production' CHECK (environment IN ('production', 'sandbox')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_rc_id ON subscriptions(revenuecat_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

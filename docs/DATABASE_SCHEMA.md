# Supabase Database Schema (v2.0)

## Critical Fix: Unauthenticated Users

**Problem:** Users can analyze documents without logging in, but the analysis isn't saved to the `documents` table because `create_analyzed_document()` only runs if `auth_user_id` exists.

**Solution:** Require authentication for analysis OR store analysis with nullable owner_id.

## Tables

###  `public.documents`
```sql
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',  -- draft|analyzed|pending_signatures|partially_signed|completed|expired|rejected
    analysis_id TEXT,
    company_pays_analysis BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `public.document_signers`
```sql
CREATE TABLE public.document_signers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL,  -- sender|recipient
    status TEXT NOT NULL DEFAULT 'pending',  -- pending|signed|rejected
    signed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    signature_id UUID REFERENCES public.signatures(id)
);
```

### `public.document_events` (Audit Trail)
```sql
CREATE TABLE public.document_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,  -- created|shared|signed|rejected|viewed|verified
    actor_user_id UUID,
    actor_email TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### `public.signatures`
```sql
CREATE TABLE public.signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    signer_name TEXT NOT NULL,
    signature_image BYTEA,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Indexes
- `idx_documents_owner_id` ON `documents(owner_id)`
- `idx_document_signers_document_id` ON `document_signers(document_id)`
- `idx_document_signers_email` ON `document_signers(email)`
- `idx_document_events_document_id` ON `document_events(document_id)`


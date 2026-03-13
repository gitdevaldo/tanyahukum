-- Create user_signatures table for reusable signatures
CREATE TABLE IF NOT EXISTS public.user_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('text', 'drawn', 'image')),
    display_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_default BOOLEAN DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_signatures_unique 
ON public.user_signatures(user_id, display_name);

CREATE INDEX IF NOT EXISTS idx_user_signatures_user_id 
ON public.user_signatures(user_id);

ALTER TABLE public.signatures 
ADD COLUMN IF NOT EXISTS user_signature_id UUID REFERENCES public.user_signatures(id) ON DELETE SET NULL;

ALTER TABLE public.signatures 
ADD COLUMN IF NOT EXISTS signature_type TEXT CHECK (signature_type IN ('text', 'drawn', 'image'));

CREATE INDEX IF NOT EXISTS idx_signatures_user_signature_id 
ON public.signatures(user_signature_id);

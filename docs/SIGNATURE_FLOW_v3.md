# Signature Flow v3.0

## Database Changes

### New Table: `user_signatures`
Stores reusable signatures per user.

```sql
CREATE TABLE public.user_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    type TEXT NOT NULL,  -- 'text'|'drawn'|'image'
    display_name TEXT NOT NULL,  -- Display name shown in dropdown
    content TEXT,  -- For 'text': name itself, for 'drawn'/'image': base64 data
    created_at TIMESTAMP,
    is_default BOOLEAN DEFAULT FALSE
);
```

## Flow

### Step 1: Signature Setup (Tanda Tangan Page, Right Sidebar)
1. User selects document to sign
2. Right sidebar shows signature setup form:
   - Input field: "Nama Penandatangan" (e.g., "John Doe")
   - Radio buttons: "Nama saja" | "Tanda Tangan" | "Upload Gambar"
   - If "Tanda Tangan": Shows canvas for drawing (auto-save to user_signatures on draw complete)
   - If "Upload Gambar": File picker (auto-save to user_signatures on upload)
   - If "Nama saja": Just save the text
   - Button "Tanda Tangani" (disabled until form complete)
3. Auto-save signature to `user_signatures` table

### Step 2: Open Signing Editor
1. Click "Tanda Tangani" button
2. Opens new tab: `/dashboard/sign/[documentId]`
3. New tab layout:
   - **Left sidebar (30%)** (vertical):
     - Document info: name, owner, status
     - Signature preview (what will be placed)
     - Button: "Tanda Tangani" (white/primary)
   - **Right (70%)**:
     - Full PDF viewer
     - User drags signature onto PDF (click to place, drag to position, click to finalize)

### Step 3: Place Signature & Save
1. User positions signature on PDF
2. Clicks "Tanda Tangani" button in left sidebar
3. Backend:
   - Saves positioned signature to `signatures` table (link to `user_signatures`)
   - Updates `document_signers.status` = 'signed'
   - Updates `document_signers.signed_at` = NOW()
   - Updates `documents.status` = 'completed' (if all signers signed) or 'partially_signed'
4. Frontend: Auto-closes tab, redirects to `/dashboard/?section=Tanda%20Tangan`

## Components

- `SignatureSelector`: Dropdown showing user's saved signatures, option to create new
- `SignatureCreator`: Form for creating new signature (Text/Draw/Image)
- `SigningEditorPage`: New tab with full-screen signing interface
- `PdfSigningViewer`: PDF viewer with drag-to-place for signatures


"""Signature management service - handles saving, retrieving, and managing user signatures."""

import uuid
import logging
import psycopg
from psycopg.rows import dict_row

from api.config import settings
from api.services.supabase_auth import SupabaseServiceError

logger = logging.getLogger(__name__)


def _db_connect():
    if not settings.supabase_db_url:
        raise SupabaseServiceError(status_code=503, detail="Database not configured")
    return psycopg.connect(settings.supabase_db_url, row_factory=dict_row)


def save_user_signature(
    user_id: str,
    signature_type: str,  # 'text', 'drawn', 'image'
    display_name: str,
    content: str,
    is_default: bool = False
):
    """Save a reusable signature for a user."""
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                sig_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO public.user_signatures (id, user_id, type, display_name, content, is_default)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING *
                """, (sig_id, user_id, signature_type, display_name, content, is_default))
                result = cur.fetchone()
                conn.commit()
                logger.info(f"Saved signature '{display_name}' for user {user_id}")
                return result
    except Exception as e:
        logger.error(f"Error saving signature: {str(e)}")
        return None


def get_user_signatures(user_id: str):
    """Get all saved signatures for a user."""
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT * FROM public.user_signatures 
                    WHERE user_id = %s 
                    ORDER BY created_at DESC
                """, (user_id,))
                return cur.fetchall() or []
    except Exception as e:
        logger.error(f"Error fetching signatures: {str(e)}")
        return []


def get_default_signature(user_id: str):
    """Get the user's default signature."""
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT * FROM public.user_signatures 
                    WHERE user_id = %s AND is_default = TRUE 
                    LIMIT 1
                """, (user_id,))
                return cur.fetchone()
    except Exception as e:
        logger.error(f"Error fetching default signature: {str(e)}")
        return None


def set_default_signature(signature_id: str, user_id: str):
    """Set a signature as default for a user."""
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                # Unset current default
                cur.execute("""
                    UPDATE public.user_signatures 
                    SET is_default = FALSE 
                    WHERE user_id = %s
                """, (user_id,))
                
                # Set new default
                cur.execute("""
                    UPDATE public.user_signatures 
                    SET is_default = TRUE 
                    WHERE id = %s AND user_id = %s
                """, (signature_id, user_id))
                
                conn.commit()
                return True
    except Exception as e:
        logger.error(f"Error setting default signature: {str(e)}")
        return False


def delete_user_signature(signature_id: str, user_id: str):
    """Delete a signature."""
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM public.user_signatures 
                    WHERE id = %s AND user_id = %s
                """, (signature_id, user_id))
                conn.commit()
                return True
    except Exception as e:
        logger.error(f"Error deleting signature: {str(e)}")
        return False


def save_document_signature(
    document_id: str,
    signer_name: str,
    user_signature_id: str = None,
    signature_type: str = None,
    signature_image: bytes = None
):
    """Save a signature placed on a document."""
    try:
        with _db_connect() as conn:
            with conn.cursor() as cur:
                sig_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO public.signatures 
                    (id, document_id, signer_name, user_signature_id, signature_type, signature_image)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING *
                """, (sig_id, document_id, signer_name, user_signature_id, signature_type, signature_image))
                result = cur.fetchone()
                conn.commit()
                logger.info(f"Saved signature for document {document_id}")
                return result
    except Exception as e:
        logger.error(f"Error saving document signature: {str(e)}")
        return None


"""Signature management service - handles saving, retrieving, and managing user signatures."""

import uuid
import logging
from typing import Optional
from .db import supabase

logger = logging.getLogger(__name__)


def save_user_signature(
    user_id: str,
    signature_type: str,  # 'text', 'drawn', 'image'
    display_name: str,
    content: str,
    is_default: bool = False
) -> Optional[dict]:
    """
    Save a reusable signature for a user.
    
    Args:
        user_id: User UUID
        signature_type: 'text', 'drawn', or 'image'
        display_name: Display name (e.g., "John Doe", "My Signature")
        content: For 'text': the name; for 'drawn'/'image': base64 data
        is_default: Whether to set as default signature
    
    Returns:
        Created signature dict or None if failed
    """
    try:
        data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": signature_type,
            "display_name": display_name,
            "content": content,
            "is_default": is_default,
        }
        
        result = supabase.table("user_signatures").insert(data).execute()
        
        if result.data:
            logger.info(f"Saved signature '{display_name}' for user {user_id}")
            return result.data[0]
        else:
            logger.error(f"Failed to save signature for user {user_id}")
            return None
            
    except Exception as e:
        logger.error(f"Error saving signature: {str(e)}")
        return None


def get_user_signatures(user_id: str) -> list:
    """Get all saved signatures for a user."""
    try:
        result = supabase.table("user_signatures").select("*").eq("user_id", user_id).execute()
        return result.data or []
    except Exception as e:
        logger.error(f"Error fetching signatures for user {user_id}: {str(e)}")
        return []


def get_default_signature(user_id: str) -> Optional[dict]:
    """Get the default signature for a user."""
    try:
        result = (
            supabase.table("user_signatures")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_default", True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error(f"Error fetching default signature for user {user_id}: {str(e)}")
        return None


def set_default_signature(signature_id: str, user_id: str) -> bool:
    """Set a signature as default for a user."""
    try:
        # First unset current default
        supabase.table("user_signatures").update({"is_default": False}).eq(
            "user_id", user_id
        ).execute()
        
        # Set new default
        result = supabase.table("user_signatures").update({"is_default": True}).eq(
            "id", signature_id
        ).eq("user_id", user_id).execute()
        
        return bool(result.data)
    except Exception as e:
        logger.error(f"Error setting default signature: {str(e)}")
        return False


def delete_user_signature(signature_id: str, user_id: str) -> bool:
    """Delete a signature."""
    try:
        result = supabase.table("user_signatures").delete().eq("id", signature_id).eq(
            "user_id", user_id
        ).execute()
        return True
    except Exception as e:
        logger.error(f"Error deleting signature: {str(e)}")
        return False


def save_document_signature(
    document_id: str,
    signer_name: str,
    user_signature_id: str,
    signature_type: str,
    signature_image: Optional[bytes] = None
) -> Optional[dict]:
    """
    Save a signature placed on a document.
    
    Args:
        document_id: Document UUID
        signer_name: Name of the signer
        user_signature_id: Reference to user's saved signature
        signature_type: 'text', 'drawn', or 'image'
        signature_image: Optional binary image data
    
    Returns:
        Created signature record or None
    """
    try:
        data = {
            "id": str(uuid.uuid4()),
            "document_id": document_id,
            "signer_name": signer_name,
            "user_signature_id": user_signature_id,
            "signature_type": signature_type,
            "signature_image": signature_image,
        }
        
        result = supabase.table("signatures").insert(data).execute()
        
        if result.data:
            logger.info(f"Saved signature for document {document_id}")
            return result.data[0]
        else:
            logger.error(f"Failed to save signature for document {document_id}")
            return None
            
    except Exception as e:
        logger.error(f"Error saving document signature: {str(e)}")
        return None

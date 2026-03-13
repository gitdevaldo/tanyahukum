"""API endpoints for signature management."""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from api.models.schemas import BearerTokenResponse
from api.services.auth import verify_bearer_token
from api.services.signature_manager import (
    save_user_signature,
    get_user_signatures,
    get_default_signature,
    set_default_signature,
    delete_user_signature,
    save_document_signature,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/signatures", tags=["signatures"])


@router.post("/user")
async def create_user_signature(
    signature_type: str,
    display_name: str,
    content: str,
    is_default: bool = False,
    auth_user_id: str = Depends(verify_bearer_token),
):
    """Create and save a reusable signature for the user."""
    if not signature_type or signature_type not in ["text", "drawn", "image"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature type. Must be 'text', 'drawn', or 'image'."
        )
    
    result = save_user_signature(
        user_id=auth_user_id,
        signature_type=signature_type,
        display_name=display_name,
        content=content,
        is_default=is_default
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save signature"
        )
    
    return {"signature": result}


@router.get("/user/list")
async def list_user_signatures(auth_user_id: str = Depends(verify_bearer_token)):
    """Get all signatures for the current user."""
    signatures = get_user_signatures(auth_user_id)
    return {"signatures": signatures}


@router.get("/user/default")
async def get_default_user_signature(auth_user_id: str = Depends(verify_bearer_token)):
    """Get the user's default signature."""
    signature = get_default_signature(auth_user_id)
    return {"signature": signature}


@router.put("/user/{signature_id}/default")
async def set_signature_as_default(
    signature_id: str,
    auth_user_id: str = Depends(verify_bearer_token)
):
    """Set a signature as the user's default."""
    success = set_default_signature(signature_id, auth_user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to set default signature"
        )
    
    return {"success": True}


@router.delete("/user/{signature_id}")
async def delete_signature(
    signature_id: str,
    auth_user_id: str = Depends(verify_bearer_token)
):
    """Delete a signature."""
    success = delete_user_signature(signature_id, auth_user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete signature"
        )
    
    return {"success": True}


@router.post("/document/{document_id}")
async def apply_document_signature(
    document_id: str,
    signer_name: str,
    user_signature_id: str,
    signature_type: str,
    auth_user_id: str = Depends(verify_bearer_token),
):
    """Apply a signature to a document (place on PDF and save)."""
    result = save_document_signature(
        document_id=document_id,
        signer_name=signer_name,
        user_signature_id=user_signature_id,
        signature_type=signature_type
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to apply signature to document"
        )
    
    return {"signature": result}

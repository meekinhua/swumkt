"""
Push Notification Service
Self-hosted Web Push implementation using VAPID
"""

import os
import json
import base64
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from py_vapid import Vapid
from pywebpush import webpush, WebPushException
from cryptography.hazmat.primitives import serialization
import logging

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        """Initialize notification service with VAPID keys"""
        self.vapid_private_key = os.environ.get('VAPID_PRIVATE_KEY')
        self.vapid_public_key = os.environ.get('VAPID_PUBLIC_KEY')
        self.vapid_email = os.environ.get('VAPID_EMAIL', 'mailto:admin@swumkt.ac.th')
        
        # Validate VAPID keys
        if not self.vapid_private_key or not self.vapid_public_key:
            logger.error("VAPID keys not found in environment variables!")
            logger.error("Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env file")
            raise ValueError("VAPID keys are required for push notifications")
        
        # Validate public key format (should be 87 chars for P-256)
        if len(self.vapid_public_key) != 87:
            logger.warning(f"VAPID public key length is {len(self.vapid_public_key)}, expected 87")
        
        logger.info(f"✅ VAPID keys loaded successfully")
        logger.info(f"Public key: {self.vapid_public_key[:20]}...{self.vapid_public_key[-20:]}")
    
    def get_public_key(self) -> str:
        """Get VAPID public key for frontend"""
        return self.vapid_public_key
    
    async def send_notification(
        self,
        subscription_info: Dict[str, Any],
        title: str,
        body: str,
        url: str = "/",
        icon: Optional[str] = None,
        tag: str = "swumkt-notification",
        require_interaction: bool = True  # Changed to True for iOS
    ) -> bool:
        """
        Send push notification to a subscription
        
        Args:
            subscription_info: Browser push subscription object
            title: Notification title
            body: Notification body text
            url: URL to open when clicked
            icon: Optional custom icon URL
            tag: Notification tag for grouping
            require_interaction: Whether notification requires user interaction
            
        Returns:
            bool: True if sent successfully, False otherwise
        """
        try:
            # Default icon
            if not icon:
                icon = "https://customer-assets.emergentagent.com/job_swumkt-journey-map/artifacts/1psb2wj1_SWU_MKT%20Stacked%20Logo%20-%20Edited.png"
            
            # Prepare notification payload (iOS compatible)
            payload = json.dumps({
                "title": title,
                "body": body,
                "icon": icon,
                "badge": icon,
                "data": {
                    "url": url,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                "tag": tag,
                "requireInteraction": require_interaction,
                # iOS specific
                "silent": False,
                "renotify": True,
                "actions": []
            })
            
            # Log subscription endpoint for debugging
            endpoint = subscription_info.get("endpoint", "")
            logger.info(f"📤 Sending to endpoint: {endpoint[:60]}...")
            
            # Send push notification
            response = webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=self.vapid_private_key,
                vapid_claims={
                    "sub": self.vapid_email
                }
            )
            
            logger.info(f"✅ Push notification sent successfully: HTTP {response.status_code}")
            logger.info(f"📱 Response: {response.text if hasattr(response, 'text') else 'No response text'}")
            return True
            
        except WebPushException as e:
            logger.error(f"WebPush error: {e}")
            # If subscription is expired/invalid, return False to mark for deletion
            if e.response and e.response.status_code in [404, 410]:
                logger.info("Subscription expired or invalid")
                return False
            raise
        except Exception as e:
            logger.error(f"Error sending push notification: {e}")
            return False
    
    async def send_to_multiple(
        self,
        subscriptions: List[Dict[str, Any]],
        title: str,
        body: str,
        url: str = "/",
        icon: Optional[str] = None,
        tag: str = "swumkt-notification"
    ) -> Dict[str, Any]:
        """
        Send notification to multiple subscriptions
        
        Returns:
            Dict with success/failure counts and invalid subscription IDs
        """
        results = {
            "sent": 0,
            "failed": 0,
            "invalid_subscriptions": []
        }
        
        for sub in subscriptions:
            try:
                subscription_info = sub.get("subscription_info")
                if not subscription_info:
                    continue
                
                success = await self.send_notification(
                    subscription_info=subscription_info,
                    title=title,
                    body=body,
                    url=url,
                    icon=icon,
                    tag=tag
                )
                
                if success:
                    results["sent"] += 1
                else:
                    results["failed"] += 1
                    results["invalid_subscriptions"].append(sub.get("id"))
                    
            except Exception as e:
                logger.error(f"Error sending to subscription: {e}")
                results["failed"] += 1
        
        return results

# Global notification service instance
notification_service = NotificationService()

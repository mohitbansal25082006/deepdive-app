# Confirm Sign up Template

<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 16px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #6C63FF, #8B5CF6); padding: 32px; text-align: center;">
    <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #ffffff;">DeepDive AI</h1>
    <p style="margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">Your AI Research Agent</p>
  </div>
  <div style="padding: 32px; text-align: center;">
    <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 12px; text-align: left;">Verify your email</h2>
    <p style="color: #A0A0C0; font-size: 15px; line-height: 24px; margin: 0 0 28px; text-align: left;">
      Thanks for signing up! Enter this code in the DeepDive AI app to verify your account.
    </p>
    <div style="background: #1A1A35; border: 2px solid #6C63FF; border-radius: 16px; padding: 24px; margin: 0 0 24px; letter-spacing: 16px; font-size: 36px; font-weight: 800; color: #ffffff;">
      {{ .Token }}
    </div>
    <p style="color: #5A5A7A; font-size: 13px; line-height: 20px; margin: 0; text-align: left;">
      This code expires in 1 hour and can only be used once.<br/>
      If you didn't create a DeepDive AI account, ignore this email.
    </p>
  </div>
  <div style="background: #12122A; padding: 16px; text-align: center;">
    <p style="color: #5A5A7A; font-size: 12px; margin: 0;">© 2025 DeepDive AI. All rights reserved.</p>
  </div>
</div>

# Magic Link Template

<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0A0A1A; color: #ffffff; border-radius: 16px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #6C63FF, #8B5CF6); padding: 32px; text-align: center;">
    <h1 style="margin: 0; font-size: 28px; font-weight: 800;">DeepDive AI</h1>
    <p style="margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">Password Reset Code</p>
  </div>
  <div style="padding: 32px; text-align: center;">
    <p style="color: #A0A0C0; font-size: 15px; margin: 0 0 24px;">Your password reset verification code is:</p>
    <div style="background: #1A1A35; border: 2px solid #6C63FF; border-radius: 16px; padding: 24px; margin: 0 0 24px; letter-spacing: 16px; font-size: 36px; font-weight: 800; color: #ffffff;">
      {{ .Token }}
    </div>
    <p style="color: #5A5A7A; font-size: 13px; line-height: 20px; margin: 0;">
      This code expires in 1 hour and can only be used once.<br/>
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>
  <div style="background: #12122A; padding: 16px; text-align: center;">
    <p style="color: #5A5A7A; font-size: 12px; margin: 0;">© 2025 DeepDive AI. All rights reserved.</p>
  </div>
</div>
import { RgpdEmailData } from '../types/rgpd';

export class EmailService {
  constructor() {
    // Configuration Resend (même que EmailToSendService)
  }

  async sendRgpdEmail(emailData: RgpdEmailData): Promise<boolean> {
    try {
      const RESEND_API_KEY = process.env['RESEND_API_KEY'];
      if (!RESEND_API_KEY) {
        console.error('❌ RESEND_API_KEY manquant');
        return false;
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env['RESEND_FROM_EMAIL'] || 'noreply@howpass.com',
          to: emailData.to,
          subject: emailData.subject,
          html: emailData.htmlContent,
          attachments: emailData.attachments || []
        }),
      });

      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) {
        console.error('❌ Erreur Resend:', data?.error || 'Unknown Resend error');
        return false;
      }

      console.log(`✅ Email RGPD envoyé avec succès à ${emailData.to}:`, data.id);
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi de l\'email RGPD:', error);
      return false;
    }
  }

  generateDataExportEmailHtml(_userEmail: string, downloadUrl?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Export de vos données - HowPass</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { padding: 20px 0; }
          .button { 
            display: inline-block; 
            background-color: #007bff; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 20px 0;
          }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Export de vos données personnelles</h1>
          </div>
          <div class="content">
            <p>Bonjour,</p>
            <p>Nous avons traité votre demande d'export de données personnelles conformément au RGPD.</p>
            <p>Vos données ont été compilées et sont maintenant disponibles au téléchargement :</p>
            ${downloadUrl ? `
              <p style="text-align: center;">
                <a href="${downloadUrl}" class="button">📥 Télécharger mes données</a>
              </p>
            ` : `
              <p><strong>Vos données sont jointes à cet email.</strong></p>
            `}
            <p><strong>Ce que contient l'export :</strong></p>
            <ul>
              <li>Vos informations personnelles</li>
              <li>Vos conversations avec l'IA</li>
              <li>Vos vidéos et médias</li>
              <li>Vos bilans et analyses</li>
              <li>Métadonnées et statistiques</li>
            </ul>
            <p><strong>Important :</strong></p>
            <ul>
              <li>Ce fichier contient des informations sensibles, gardez-le en sécurité</li>
              <li>Le lien de téléchargement expire dans 7 jours</li>
              <li>Si vous avez des questions, contactez notre support</li>
            </ul>
          </div>
          <div class="footer">
            <p>HowPass - Respect de votre vie privée</p>
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateDataDeletionConfirmationEmailHtml(_userEmail: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Suppression de vos données - HowPass</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { padding: 20px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🗑️ Suppression de vos données personnelles</h1>
          </div>
          <div class="content">
            <p>Bonjour,</p>
            <p>Nous avons traité votre demande de suppression de données personnelles conformément au RGPD.</p>
            <p><strong>✅ Toutes vos données ont été supprimées de nos serveurs :</strong></p>
            <ul>
              <li>Vos informations personnelles</li>
              <li>Vos conversations avec l'IA</li>
              <li>Vos vidéos et médias</li>
              <li>Vos bilans et analyses</li>
              <li>Toutes les métadonnées associées</li>
            </ul>
            <p>Votre compte HowPass a également été désactivé.</p>
            <p>Si vous souhaitez utiliser nos services à nouveau, vous devrez créer un nouveau compte.</p>
            <p>Si vous avez des questions, contactez notre support.</p>
          </div>
          <div class="footer">
            <p>HowPass - Respect de votre vie privée</p>
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}


import { RgpdEmailData } from '../types/rgpd';
import { howpassRgpdExportTemplate } from '../templates/howpass-rgpd-export';
import { howpassRgpdDeletionTemplate } from '../templates/howpass-rgpd-deletion';

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
        console.error('❌ Erreur Resend:', data);
        return false;
      }

      console.log(`✅ Email RGPD envoyé avec succès à ${emailData.to}:`, data.id);
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi de l\'email RGPD:', error);
      return false;
    }
  }

  private loadEmailTemplate(templateName: string): string {
    switch (templateName) {
      case 'howpass-rgpd-export.html':
        return howpassRgpdExportTemplate;
      case 'howpass-rgpd-deletion.html':
        return howpassRgpdDeletionTemplate;
      default:
        console.error(`❌ Template ${templateName} non trouvé`);
        throw new Error(`Template ${templateName} non trouvé`);
    }
  }

  generateDataExportEmailHtml(_userEmail: string, downloadUrl?: string): string {
    const template = this.loadEmailTemplate('howpass-rgpd-export.html');
    
    // Remplacer les placeholders
    let html = template.replace('{{YEAR}}', new Date().getFullYear().toString());
    
    if (downloadUrl) {
      html = html.replace('{{DOWNLOAD_INSTRUCTIONS}}', 'Cliquez sur le bouton ci-dessous pour télécharger votre export :');
      html = html.replace('{{DOWNLOAD_BUTTON}}', `
        <p style="margin:0 0 12px 0;">
          <a href="${downloadUrl}" target="_blank" style="background-color:#009da7; color:#ffffff; display:inline-block; padding:10px 18px; border-radius:6px; text-decoration:none; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial; font-size:15px; font-weight:700;">📥 Télécharger mes données</a>
        </p>
      `);
      html = html.replace('{{DOWNLOAD_LINK}}', `
        <p class="muted" style="margin:0; font-size:12px; line-height:18px; color:#6b7280;">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :<br><span style="word-break:break-all; color:#00848d;">${downloadUrl}</span></p>
      `);
    } else {
      html = html.replace('{{DOWNLOAD_INSTRUCTIONS}}', 'Vos données sont jointes à cet email.');
      html = html.replace('{{DOWNLOAD_BUTTON}}', '');
      html = html.replace('{{DOWNLOAD_LINK}}', '');
    }
    
    return html;
  }


  generateDataDeletionConfirmationEmailHtml(_userEmail: string): string {
    const template = this.loadEmailTemplate('howpass-rgpd-deletion.html');
    
    // Remplacer les placeholders
    const html = template.replace('{{YEAR}}', new Date().getFullYear().toString());
    
    return html;
  }

}


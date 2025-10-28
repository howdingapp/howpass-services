import Stripe from 'stripe';
import { SupabaseService } from './SupabaseService';
import { SupabaseClient } from '@supabase/supabase-js';
import { howpassMonthlyBillingTemplate, howpassAnnualBillingTemplate } from './emails/templates/howpass-billing';

export interface BillingEmailData {
  to: string;
  subject: string;
  htmlContent: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: string;
  }>;
}

export class BillingService {
  private stripe: Stripe;
  private supabaseService: SupabaseService;
  private supabase: SupabaseClient;

  constructor() {
    const stripeSecretKey = process.env['STRIPE_SECRET_KEY'];
    
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY manquant');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-08-27.basil',
    });

    this.supabaseService = new SupabaseService();
    this.supabase = this.supabaseService.getSupabaseClient();
  }

  /**
   * Vérifie les facturations récurrentes d'aujourd'hui et envoie les emails de facturation
   */
  async processDailyBilling(): Promise<{
    success: boolean;
    processed: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    try {
      console.log('📊 Traitement des factures récurrentes du jour');

      // Récupérer toutes les subscriptions Stripe actives
      const subscriptions = await this.stripe.subscriptions.list({
        status: 'active',
        limit: 100,
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const processed: string[] = [];
      const errors: Array<{ userId: string; error: string }> = [];

      // Parcourir toutes les subscriptions
      for (const subscription of subscriptions.data) {
        try {
          // Vérifier si c'est une facturation récurrente (pas le premier paiement)
          const latestInvoice = await this.stripe.invoices.list({
            subscription: subscription.id,
            limit: 1,
          });

          if (latestInvoice.data.length === 0) continue;

          const invoice = latestInvoice.data[0];
          if (!invoice || !invoice.id) continue;

          // Vérifier si l'invoice date correspond à aujourd'hui
          const invoiceDate = new Date(invoice.created * 1000);
          invoiceDate.setHours(0, 0, 0, 0);

          if (invoiceDate.getTime() !== today.getTime()) {
            continue; // Ce n'est pas une facture d'aujourd'hui
          }

          // Récupérer le customer
          const customerId = typeof subscription.customer === 'string' 
            ? subscription.customer 
            : subscription.customer.id;

          const customer = await this.stripe.customers.retrieve(customerId);

          if (customer.deleted) continue;

          // Récupérer l'utilisateur depuis la base de données
          const userId = await this.getUserIdFromCustomer(customerId);
          
          if (!userId) {
            errors.push({
              userId: customerId,
              error: 'Utilisateur non trouvé pour ce customer Stripe'
            });
            continue;
          }

          // Récupérer les données de l'utilisateur
          const userData = await this.getUserData(userId);

          if (!userData || !userData.email) {
            errors.push({
              userId,
              error: 'Email utilisateur non trouvé'
            });
            continue;
          }

          // Récupérer les détails de la facture
          const billingDetails = await this.getInvoiceDetails(invoice.id);

          if (!billingDetails) {
            errors.push({
              userId,
              error: 'Impossible de récupérer les détails de facturation'
            });
            continue;
          }

          // Déterminer le type de facturation (mensuelle ou annuelle)
          const billingType = this.determineBillingType(subscription);

          // Envoyer l'email de facturation
          const emailSent = await this.sendBillingEmail(
            userData.email,
            userData.firstName || 'Utilisateur',
            billingType,
            billingDetails
          );

          if (emailSent) {
            processed.push(userId);
            console.log(`✅ Email de facturation envoyé à ${userData.email}`);
          } else {
            errors.push({
              userId,
              error: 'Échec de l\'envoi de l\'email'
            });
          }

        } catch (error) {
          console.error('❌ Erreur lors du traitement d\'une subscription:', error);
          errors.push({
            userId: subscription.id,
            error: error instanceof Error ? error.message : 'Erreur inconnue'
          });
        }
      }

      console.log(`✅ ${processed.length} emails de facturation envoyés avec succès`);
      if (errors.length > 0) {
        console.error(`❌ ${errors.length} erreurs rencontrées`);
      }

      return {
        success: true,
        processed: processed.length,
        errors
      };

    } catch (error) {
      console.error('❌ Erreur lors du traitement des factures récurrentes:', error);
      return {
        success: false,
        processed: 0,
        errors: [{ userId: 'system', error: error instanceof Error ? error.message : 'Erreur inconnue' }]
      };
    }
  }

  /**
   * Récupère l'ID utilisateur à partir du customer ID Stripe
   */
  private async getUserIdFromCustomer(customerId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_data')
        .select('user_id')
        .eq('customer_id', customerId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.user_id;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de l\'utilisateur:', error);
      return null;
    }
  }

  /**
   * Récupère les données utilisateur
   */
  private async getUserData(userId: string): Promise<{
    email: string;
    firstName?: string;
    lastName?: string;
  } | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_data')
        .select('email, first_name, last_name')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des données utilisateur:', error);
      return null;
    }
  }

  /**
   * Récupère les détails de facturation depuis Stripe
   */
  private async getInvoiceDetails(invoiceId: string): Promise<{
    invoiceUrl?: string;
    invoicePdfUrl?: string;
    amount: number;
    currency: string;
    description?: string;
    createdAt: number;
    lineItems: Array<{
      description: string;
      amount: number;
      quantity: number;
    }>;
  } | null> {
    try {
      const invoice = await this.stripe.invoices.retrieve(invoiceId, {
        expand: ['charge']
      });

      const lineItems = invoice.lines.data.map(item => ({
        description: item.description || '',
        amount: (item.amount || 0) / 100,
        quantity: item.quantity || 1
      }));

      return {
        ...(invoice.hosted_invoice_url && { invoiceUrl: invoice.hosted_invoice_url }),
        ...(invoice.invoice_pdf && { invoicePdfUrl: invoice.invoice_pdf }),
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        ...(invoice.description && { description: invoice.description }),
        createdAt: invoice.created * 1000,
        lineItems
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des détails de facturation:', error);
      return null;
    }
  }

  /**
   * Détermine le type de facturation (mensuelle ou annuelle)
   */
  private determineBillingType(subscription: Stripe.Subscription): 'monthly' | 'annual' {
    // Vérifier l'interval de billing
    const interval = subscription.items.data[0]?.price?.recurring?.interval;
    
    if (interval === 'year') {
      return 'annual';
    }
    
    return 'monthly';
  }

  /**
   * Envoie l'email de facturation au client
   */
  private async sendBillingEmail(
    email: string,
    firstName: string,
    billingType: 'monthly' | 'annual',
    billingDetails: {
      invoiceUrl?: string;
      invoicePdfUrl?: string;
      amount: number;
      currency: string;
      description?: string;
      createdAt: number;
      lineItems: Array<{
        description: string;
        amount: number;
        quantity: number;
      }>;
    }
  ): Promise<boolean> {
    try {
      const RESEND_API_KEY = process.env['RESEND_API_KEY'];
      if (!RESEND_API_KEY) {
        console.error('❌ RESEND_API_KEY manquant');
        return false;
      }

      // Sélectionner le template selon le type de facturation
      const template = billingType === 'monthly' 
        ? howpassMonthlyBillingTemplate 
        : howpassAnnualBillingTemplate;

      // Préparer les données pour le template
      const htmlContent = this.generateBillingEmailHtml(
        firstName,
        billingType,
        billingDetails,
        template
      );

      // Préparer les attachments (PDF)
      const attachments = [];
      if (billingDetails.invoicePdfUrl) {
        // Télécharger le PDF depuis Stripe
        try {
          const pdfResponse = await fetch(billingDetails.invoicePdfUrl);
          if (pdfResponse.ok) {
            const pdfBuffer = await pdfResponse.arrayBuffer();
            attachments.push({
              filename: `Facture_${new Date(billingDetails.createdAt).toISOString().split('T')[0]}.pdf`,
              content: Buffer.from(pdfBuffer).toString('base64')
            });
          }
        } catch (error) {
          console.warn('⚠️ Impossible de télécharger le PDF:', error);
        }
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env['RESEND_FROM_EMAIL'] || 'noreply@howpass.com',
          to: email,
          subject: `Détail de votre facturation ${billingType === 'monthly' ? 'mensuelle' : 'annuelle'}`,
          html: htmlContent,
          attachments
        }),
      });

      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) {
        console.error('❌ Erreur Resend:', data);
        return false;
      }

      console.log(`✅ Email de facturation envoyé avec succès à ${email}:`, data.id);
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi de l\'email de facturation:', error);
      return false;
    }
  }

  /**
   * Génère le contenu HTML de l'email de facturation
   */
  private generateBillingEmailHtml(
    firstName: string,
    billingType: 'monthly' | 'annual',
    billingDetails: any,
    template: string
  ): string {
    let html = template;

    // Remplacer les variables
    html = html.replace(/{{FIRST_NAME}}/g, firstName);
    html = html.replace(/{{BILLING_TYPE}}/g, billingType === 'monthly' ? 'mensuelle' : 'annuelle');
    html = html.replace(/{{AMOUNT}}/g, billingDetails.amount.toFixed(2));
    html = html.replace(/{{CURRENCY}}/g, billingDetails.currency.toUpperCase());
    html = html.replace(/{{DATE}}}/g, new Date(billingDetails.createdAt).toLocaleDateString('fr-FR'));

    // Remplacer les line items
    if (billingDetails.lineItems && billingDetails.lineItems.length > 0) {
      const lineItemsHtml = billingDetails.lineItems.map((item: any) => 
        `<li>${item.description} - ${item.amount.toFixed(2)}€ x${item.quantity}</li>`
      ).join('\n');
      html = html.replace(/{{LINE_ITEMS}}/g, lineItemsHtml);
    } else {
      html = html.replace(/{{LINE_ITEMS}}/g, '<li>Aucun détail disponible</li>');
    }

    // Remplacer les liens vers la facture
    if (billingDetails.invoiceUrl) {
      html = html.replace(/{{INVOICE_URL}}/g, billingDetails.invoiceUrl);
    } else {
      html = html.replace(/href="{{INVOICE_URL}}"/g, '#');
    }

    // Support email
    const supportEmail = process.env['SUPPORT_EMAIL'] || 'howding2022@gmail.com';
    html = html.replace(/{{SUPPORT_EMAIL}}/g, supportEmail);

    // Year
    html = html.replace(/{{YEAR}}/g, new Date().getFullYear().toString());

    return html;
  }
}


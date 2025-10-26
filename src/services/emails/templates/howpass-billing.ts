export const howpassMonthlyBillingTemplate = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Détail de votre facturation mensuelle - Howpass</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9fafb;
        }
        .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #f59e0b;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #f59e0b;
            margin-bottom: 10px;
        }
        .title {
            font-size: 24px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 10px 0;
        }
        .billing-info {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        .billing-amount {
            font-size: 32px;
            font-weight: 700;
            color: #92400e;
            margin: 10px 0;
        }
        .billing-details {
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-label {
            font-weight: 600;
            color: #6b7280;
        }
        .detail-value {
            color: #111827;
        }
        .line-items {
            background-color: #f9fafb;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
        }
        .line-items-title {
            font-weight: 600;
            color: #111827;
            margin-bottom: 10px;
        }
        .line-items-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .line-items-list li {
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .invoice-actions {
            text-align: center;
            margin: 30px 0;
        }
        .invoice-button {
            display: inline-block;
            background-color: #f59e0b;
            color: #ffffff;
            padding: 12px 30px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            margin: 5px;
        }
        .invoice-button:hover {
            background-color: #d97706;
        }
        .support-section {
            background-color: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        .footer {
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
            margin-top: 30px;
            text-align: center;
        }
        .footer-text {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Howpass</div>
            <h1 class="title">📧 Détail de votre facturation {{BILLING_TYPE}}</h1>
        </div>

        <p>Bonjour <strong>{{FIRST_NAME}}</strong>,</p>

        <p>Vous trouverez ci-dessous les détails de votre facturation mensuelle pour Howpass.</p>

        <div class="billing-info">
            <p style="margin:0 0 5px 0; font-size:14px; color:#78350f;">Montant total</p>
            <div class="billing-amount">{{AMOUNT}} {{CURRENCY}}</div>
            <p style="margin:5px 0 0 0; font-size:14px; color:#78350f;">Date de facturation : {{DATE}}</p>
        </div>

        <div class="line-items">
            <div class="line-items-title">Détail de votre commande :</div>
            <ul class="line-items-list">
                {{LINE_ITEMS}}
            </ul>
        </div>

        <div class="invoice-actions">
            <p style="margin:0 0 15px 0; font-size:16px; font-weight:600;">Téléchargez votre facture :</p>
            <a href="{{INVOICE_URL}}" class="invoice-button" target="_blank">
                📥 Télécharger la facture (PDF)
            </a>
        </div>

        <div class="support-section">
            <p style="margin:0 0 8px 0; font-weight:600; color:#1e40af;">📧 Questions sur votre facturation ?</p>
            <p style="margin:0; font-size:14px; color:#1e40af;">
                Notre équipe est là pour vous aider. N'hésitez pas à nous contacter à {{SUPPORT_EMAIL}}
            </p>
        </div>

        <div class="footer">
            <p class="footer-text">
                © {{YEAR}} Howpass. Tous droits réservés.<br>
                Cet email a été envoyé automatiquement, merci de ne pas y répondre.
            </p>
        </div>
    </div>
</body>
</html>`;

export const howpassAnnualBillingTemplate = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Détail de votre facturation annuelle - Howpass</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9fafb;
        }
        .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #3b82f6;
        }
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #3b82f6;
            margin-bottom: 10px;
        }
        .title {
            font-size: 24px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 10px 0;
        }
        .billing-info {
            background-color: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        .billing-amount {
            font-size: 32px;
            font-weight: 700;
            color: #1e40af;
            margin: 10px 0;
        }
        .billing-details {
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-label {
            font-weight: 600;
            color: #6b7280;
        }
        .detail-value {
            color: #111827;
        }
        .line-items {
            background-color: #f9fafb;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
        }
        .line-items-title {
            font-weight: 600;
            color: #111827;
            margin-bottom: 10px;
        }
        .line-items-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .line-items-list li {
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .invoice-actions {
            text-align: center;
            margin: 30px 0;
        }
        .invoice-button {
            display: inline-block;
            background-color: #3b82f6;
            color: #ffffff;
            padding: 12px 30px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            margin: 5px;
        }
        .invoice-button:hover {
            background-color: #2563eb;
        }
        .support-section {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        .footer {
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
            margin-top: 30px;
            text-align: center;
        }
        .footer-text {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Howpass</div>
            <h1 class="title">📧 Détail de votre facturation {{BILLING_TYPE}}</h1>
        </div>

        <p>Bonjour <strong>{{FIRST_NAME}}</strong>,</p>

        <p>Vous trouverez ci-dessous les détails de votre facturation annuelle pour Howpass.</p>

        <div class="billing-info">
            <p style="margin:0 0 5px 0; font-size:14px; color:#1e40af;">Montant total</p>
            <div class="billing-amount">{{AMOUNT}} {{CURRENCY}}</div>
            <p style="margin:5px 0 0 0; font-size:14px; color:#1e40af;">Date de facturation : {{DATE}}</p>
        </div>

        <div class="line-items">
            <div class="line-items-title">Détail de votre commande :</div>
            <ul class="line-items-list">
                {{LINE_ITEMS}}
            </ul>
        </div>

        <div class="invoice-actions">
            <p style="margin:0 0 15px 0; font-size:16px; font-weight:600;">Téléchargez votre facture :</p>
            <a href="{{INVOICE_URL}}" class="invoice-button" target="_blank">
                📥 Télécharger la facture (PDF)
            </a>
        </div>

        <div class="support-section">
            <p style="margin:0 0 8px 0; font-weight:600; color:#92400e;">📧 Questions sur votre facturation ?</p>
            <p style="margin:0; font-size:14px; color:#92400e;">
                Notre équipe est là pour vous aider. N'hésitez pas à nous contacter à {{SUPPORT_EMAIL}}
            </p>
        </div>

        <div class="footer">
            <p class="footer-text">
                © {{YEAR}} Howpass. Tous droits réservés.<br>
                Cet email a été envoyé automatiquement, merci de ne pas y répondre.
            </p>
        </div>
    </div>
</body>
</html>`;


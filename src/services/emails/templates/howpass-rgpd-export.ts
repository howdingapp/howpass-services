export const howpassRgpdExportTemplate = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Export de vos données - Howpass</title>
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
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #009da7;
            margin-bottom: 10px;
        }
        .title {
            font-size: 28px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 10px 0;
        }
        .subtitle {
            font-size: 16px;
            color: #6b7280;
            margin: 0;
        }
        .content {
            margin-bottom: 30px;
        }
        .section {
            margin-bottom: 25px;
        }
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #111827;
            margin: 0 0 10px 0;
        }
        .section-content {
            font-size: 15px;
            color: #374151;
            line-height: 1.6;
        }
        .download-section {
            background-color: #f3f4f6;
            border-radius: 6px;
            padding: 20px;
            text-align: center;
            margin: 25px 0;
        }
        .download-button {
            background-color: #009da7;
            color: #ffffff;
            display: inline-block;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            margin: 10px 0;
            transition: background-color 0.2s;
        }
        .download-button:hover {
            background-color: #00848d;
        }
        .download-link {
            font-size: 12px;
            color: #6b7280;
            margin-top: 15px;
            word-break: break-all;
        }
        .info-box {
            background-color: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        .info-box-title {
            font-weight: 600;
            color: #1e40af;
            margin: 0 0 8px 0;
        }
        .info-box-content {
            font-size: 14px;
            color: #1e40af;
            margin: 0;
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
        .muted {
            font-size: 12px;
            color: #6b7280;
        }
        .highlight {
            background-color: #fef3c7;
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 500;
        }
        @media (max-width: 600px) {
            body {
                padding: 10px;
            }
            .container {
                padding: 20px;
            }
            .title {
                font-size: 24px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Howpass</div>
            <h1 class="title">📊 Export de vos données personnelles</h1>
            <p class="subtitle">Conformément au RGPD, voici l'export de toutes vos données</p>
        </div>

        <div class="content">
            <div class="section">
                <h2 class="section-title">🎯 Qu'est-ce qui est inclus dans cet export ?</h2>
                <div class="section-content">
                    <p>Cet export contient <span class="highlight">toutes vos données personnelles</span> stockées sur Howpass :</p>
                    <ul>
                        <li><strong>Profil utilisateur :</strong> informations personnelles, préférences, statistiques</li>
                        <li><strong>Activités :</strong> vos créations et participations</li>
                        <li><strong>Bilans :</strong> vos évaluations et notes personnelles</li>
                        <li><strong>Rendez-vous :</strong> historique complet de vos sessions</li>
                        <li><strong>Communications :</strong> emails, notifications, conversations</li>
                        <li><strong>Données financières :</strong> coffre au trésor, référents</li>
                        <li><strong>Médias :</strong> photos, vidéos, sons uploadés</li>
                    </ul>
                </div>
            </div>

            <div class="info-box">
                <h3 class="info-box-title">🔒 Confidentialité et sécurité</h3>
                <p class="info-box-content">
                    Cet export est <strong>strictement personnel</strong> et contient des informations sensibles. 
                    Nous vous recommandons de le stocker en sécurité et de ne pas le partager.
                </p>
            </div>

            <div class="download-section">
                <h2 class="section-title">📥 Téléchargement de vos données</h2>
                <p class="section-content">{{DOWNLOAD_INSTRUCTIONS}}</p>
                {{DOWNLOAD_BUTTON}}
                {{DOWNLOAD_LINK}}
            </div>

            <div class="section">
                <h2 class="section-title">📋 Format des données</h2>
                <div class="section-content">
                    <p>Vos données sont exportées au format <strong>JSON</strong> structuré, facilement lisible et exploitable. 
                    Chaque section est clairement identifiée et contient :</p>
                    <ul>
                        <li>Les métadonnées (dates de création, modification)</li>
                        <li>Le contenu complet de vos données</li>
                        <li>Les relations entre les différentes entités</li>
                        <li>Un résumé statistique de vos données</li>
                    </ul>
                </div>
            </div>

            <div class="section">
                <h2 class="section-title">❓ Besoin d'aide ?</h2>
                <div class="section-content">
                    <p>Si vous avez des questions concernant cet export ou souhaitez exercer d'autres droits RGPD :</p>
                    <ul>
                        <li>📧 Email : <a href="mailto:{{SUPPORT_EMAIL}}" style="color: #009da7;">{{SUPPORT_EMAIL}}</a></li>
                        <li>📞 Support : <a href="{{SUPPORT_LINK}}" style="color: #009da7;">Centre d'aide</a></li>
                        <li>✉️ Écrire au support : <a href="mailto:{{SUPPORT_EMAIL}}" style="color: #009da7;">Écrire au support</a></li>
                    </ul>
                </div>
            </div>
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

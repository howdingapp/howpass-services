export const howpassRgpdDeletionTemplate = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmation de suppression - Howpass</title>
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
        .confirmation-box {
            background-color: #f0fdf4;
            border: 2px solid #22c55e;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 25px 0;
        }
        .confirmation-icon {
            font-size: 48px;
            margin-bottom: 15px;
        }
        .confirmation-title {
            font-size: 20px;
            font-weight: 700;
            color: #15803d;
            margin: 0 0 10px 0;
        }
        .confirmation-text {
            font-size: 16px;
            color: #166534;
            margin: 0;
        }
        .info-box {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        .info-box-title {
            font-weight: 600;
            color: #92400e;
            margin: 0 0 8px 0;
        }
        .info-box-content {
            font-size: 14px;
            color: #92400e;
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
        .highlight {
            background-color: #fef3c7;
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 500;
        }
        .warning-box {
            background-color: #fef2f2;
            border-left: 4px solid #ef4444;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 6px 6px 0;
        }
        .warning-title {
            font-weight: 600;
            color: #dc2626;
            margin: 0 0 8px 0;
        }
        .warning-content {
            font-size: 14px;
            color: #dc2626;
            margin: 0;
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
            <h1 class="title">🗑️ Suppression de vos données confirmée</h1>
            <p class="subtitle">Votre demande de suppression RGPD a été traitée</p>
        </div>

        <div class="content">
            <div class="confirmation-box">
                <div class="confirmation-icon">✅</div>
                <h2 class="confirmation-title">Suppression terminée</h2>
                <p class="confirmation-text">
                    Toutes vos données personnelles ont été <strong>définitivement supprimées</strong> de nos serveurs.
                </p>
            </div>

            <div class="section">
                <h2 class="section-title">📋 Ce qui a été supprimé</h2>
                <div class="section-content">
                    <p>Conformément à votre demande, nous avons supprimé :</p>
                    <ul>
                        <li><strong>Profil utilisateur :</strong> toutes vos informations personnelles</li>
                        <li><strong>Activités :</strong> vos créations et participations</li>
                        <li><strong>Bilans :</strong> vos évaluations et notes personnelles</li>
                        <li><strong>Rendez-vous :</strong> historique de vos sessions</li>
                        <li><strong>Communications :</strong> emails, notifications, conversations</li>
                        <li><strong>Données financières :</strong> coffre au trésor, référents</li>
                        <li><strong>Médias :</strong> photos, vidéos, sons uploadés</li>
                        <li><strong>Données techniques :</strong> logs, métadonnées, statistiques</li>
                    </ul>
                </div>
            </div>

            <div class="warning-box">
                <h3 class="warning-title">⚠️ Action irréversible</h3>
                <p class="warning-content">
                    Cette suppression est <strong>définitive et irréversible</strong>. 
                    Il ne sera pas possible de récupérer vos données ou de restaurer votre compte.
                </p>
            </div>

            <div class="info-box">
                <h3 class="info-box-title">⏱️ Délais de suppression</h3>
                <p class="info-box-content">
                    La suppression complète peut prendre jusqu'à <strong>30 jours</strong> pour être effective sur tous nos systèmes de sauvegarde. 
                    Pendant cette période, vos données restent protégées et ne sont plus accessibles.
                </p>
            </div>

            <div class="section">
                <h2 class="section-title">📧 Données conservées légalement</h2>
                <div class="section-content">
                    <p>Certaines données peuvent être conservées pour des raisons légales :</p>
                    <ul>
                        <li>Factures et données comptables (7 ans)</li>
                        <li>Données de sécurité et logs d'audit (1 an)</li>
                        <li>Données anonymisées pour statistiques</li>
                    </ul>
                    <p>Ces données ne permettent plus de vous identifier personnellement.</p>
                </div>
            </div>

            <div class="section">
                <h2 class="section-title">🔄 Créer un nouveau compte</h2>
                <div class="section-content">
                    <p>Si vous souhaitez utiliser à nouveau nos services, vous pouvez créer un nouveau compte à tout moment :</p>
                    <p style="text-align: center; margin: 20px 0;">
                        <a href="https://howpass.com/register" style="background-color: #009da7; color: #ffffff; display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Créer un nouveau compte</a>
                    </p>
                </div>
            </div>

            <div class="section">
                <h2 class="section-title">❓ Questions ?</h2>
                <div class="section-content">
                    <p>Si vous avez des questions concernant cette suppression :</p>
                    <ul>
                        <li>📧 Email : <a href="mailto:privacy@howpass.com" style="color: #009da7;">privacy@howpass.com</a></li>
                        <li>📞 Support : <a href="https://howpass.com/support" style="color: #009da7;">Centre d'aide</a></li>
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

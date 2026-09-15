import nodemailer from 'nodemailer'

const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const from = process.env.MAIL_FROM || 'Backline <no-reply@backline.local>'

function transport() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined })
}

async function send({ to, subject, heading, body, buttonLabel, url }) {
  const html = `<div style="background:#111315;padding:42px 20px;font-family:Arial,sans-serif;color:#f6f7f5"><div style="max-width:560px;margin:auto;background:#191c1f;border:1px solid #2a2f33;border-radius:16px;overflow:hidden"><div style="padding:24px 30px;border-bottom:1px solid #2a2f33;font-weight:700;font-size:22px">back<span style="color:#d9f765">line</span></div><div style="padding:34px 30px"><p style="color:#d9f765;font-size:12px;text-transform:uppercase;letter-spacing:1px">Sécurité du compte</p><h1 style="font-size:28px;margin:0 0 18px">${heading}</h1><p style="color:#c3c9c5;line-height:1.6">${body}</p>${url ? `<a href="${url}" style="display:inline-block;margin-top:16px;padding:13px 18px;border-radius:8px;background:#d9f765;color:#1d2700;font-weight:bold;text-decoration:none">${buttonLabel}</a>` : ''}<p style="margin-top:28px;color:#8d969b;font-size:12px;line-height:1.5">Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.</p></div></div></div>`
  const mailer = transport()
  if (!mailer) { console.warn(`[mail] SMTP non configuré. Lien de développement : ${url}`); return }
  await mailer.sendMail({ from, to, subject, html })
}

export const sendVerificationEmail = (user, token) => send({ to: user.pendingEmail || user.email, subject: 'Vérifiez votre compte Backline', heading: 'Confirmez votre adresse e-mail', body: 'Bienvenue dans Backline. Confirmez votre adresse pour activer votre studio.', buttonLabel: 'Vérifier mon compte', url: `${appUrl}/?verify=${encodeURIComponent(token)}` })
export const sendProfileNotice = (user) => send({ to: user.email, subject: 'Vos informations Backline ont changé', heading: 'Modification confirmée', body: 'Les informations de votre compte viennent d’être modifiées. Si ce n’était pas vous, changez immédiatement votre mot de passe.', buttonLabel: 'Ouvrir Backline', url: appUrl })

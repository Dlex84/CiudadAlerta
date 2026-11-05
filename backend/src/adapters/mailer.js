/** Mailer de desarrollo: imprime el correo en consola (útil sin SMTP). */
export function createConsoleMailer(logger = console) {
  return {
    async send({ to, subject, text }) {
      logger.info(`\n[correo simulado] Para: ${to}\nAsunto: ${subject}\n${text}\n`);
    },
  };
}

export async function createSmtpMailer(smtp) {
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from: smtp.from, to, subject, text });
    },
  };
}

export async function createMailer(config, logger = console) {
  return config.smtp.host ? createSmtpMailer(config.smtp) : createConsoleMailer(logger);
}

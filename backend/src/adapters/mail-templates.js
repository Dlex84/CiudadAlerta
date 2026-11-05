export const inviteEmail = ({ name, link, hours }) => ({
  subject: 'Bienvenido a CiudadAlerta: configura tu contraseña',
  text: `Hola ${name},

Un administrador creó tu cuenta en CiudadAlerta. Para activarla, define tu contraseña en este enlace:

${link}

El enlace expira en ${hours} horas y solo puede usarse una vez.
Si no esperabas este mensaje, ignóralo.`,
});

export const resetEmail = ({ name, link, minutes }) => ({
  subject: 'CiudadAlerta: recuperación de contraseña',
  text: `Hola ${name},

Recibimos una solicitud para restablecer tu contraseña. Usa este enlace:

${link}

El enlace expira en ${minutes} minutos y solo puede usarse una vez.
Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.`,
});

'use strict';

const { authService, perfilService } = require('../src');
const { ErrorDeServicio } = require('../src/errors/ErrorDeServicio');
const {
  usuario,
  usuarioEditable,
  usuarioRevocado,
  dosUsuarios,
  emailUnico,
  CONTRASENA
} = require('./ayudaSupabase');

/**
 * Tests de auth y perfil contra el proyecto real de Supabase.
 *
 * Necesitan el proveedor Email activado y "Confirm email" desactivado: sin
 * confirmación, el registro no devuelve sesión y no hay nada que probar.
 *
 * Los usuarios son cinco y están cacheados porque el plan gratis limita los
 * registros por hora; ver `ayudaSupabase.js`.
 */

describe('registro', () => {
  test('crea el usuario y devuelve sesión y token', async () => {
    const u = await usuario();

    expect(typeof u.token).toBe('string');
    expect(u.token.length).toBeGreaterThan(20);
    expect(u.email).toMatch(/@/);
    // El id es el uuid que da Supabase Auth, y es el que se usa como id_autor.
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('el perfil se crea con el nombre que pidió el registro', async () => {
    const u = await usuario();

    const perfil = await perfilService.perfil({ token: u.token });

    // El trigger crea la fila al registrarse, pero en este proyecto GoTrue
    // descarta las claves propias de `raw_user_meta_data`, así que el nombre no
    // llega por ahí: lo escribe `registro` con una segunda llamada. Lo que se
    // comprueba aquí es el resultado de cara al usuario, que es lo que importa.
    expect(perfil.nombre).toBe('Usuario de prueba');
    expect(perfil.id).toBe(u.id);
    expect(perfil.email).toBe(u.email);
  });

  test('mi_perfil_actual siempre da el perfil de quien llama, no el que se pida', async () => {
    const [a, b] = await dosUsuarios();

    const perfil = await perfilService.perfil({ token: a.token });

    expect(perfil.id).toBe(a.id);
    expect(perfil.id).not.toBe(b.id);
  });

  test('rechaza un email con formato inválido sin llegar a Supabase', async () => {
    await expect(
      authService.registro({ email: 'esto-no-es-un-email', contrasena: CONTRASENA, nombre: 'X' })
    ).rejects.toThrow(ErrorDeServicio);
  });

  test('rechaza una contraseña de menos de 8 caracteres', async () => {
    await expect(
      authService.registro({ email: emailUnico('corta'), contrasena: 'corta', nombre: 'X' })
    ).rejects.toThrow(/8 caracteres/);
  });

  test('rechaza un registro sin nombre', async () => {
    await expect(
      authService.registro({ email: emailUnico('sin-nombre'), contrasena: CONTRASENA })
    ).rejects.toThrow(/nombre/i);
  });

  test('rechaza un email que ya existe', async () => {
    const email = emailUnico('duplicado');

    await authService.registro({ email, contrasena: CONTRASENA, nombre: 'Primero' });

    await expect(
      authService.registro({ email, contrasena: CONTRASENA, nombre: 'Segundo' })
    ).rejects.toThrow(ErrorDeServicio);
  });
});

describe('login', () => {
  test('inicia sesión con el email y la contraseña correctos', async () => {
    const u = await usuario();

    const { token, usuario: quien } = await authService.login(u.email, CONTRASENA);

    expect(typeof token).toBe('string');
    expect(quien.id).toBe(u.id);
  });

  test('falla con la contraseña equivocada', async () => {
    const u = await usuario();

    await expect(authService.login(u.email, 'EstaNoEsLaClave1!')).rejects.toThrow(
      ErrorDeServicio
    );
  });

  test('falla si el email no existe', async () => {
    await expect(authService.login(emailUnico('inexistente'), CONTRASENA)).rejects.toThrow(
      ErrorDeServicio
    );
  });

  test('rechaza login sin contraseña antes de llamar a Supabase', async () => {
    await expect(authService.login('alguien@example.com', '')).rejects.toThrow(ErrorDeServicio);
  });

  test('el token del login sirve para leer el perfil', async () => {
    const u = await usuario();
    const { token } = await authService.login(u.email, CONTRASENA);

    const perfil = await perfilService.perfil({ token });

    expect(perfil.email).toBe(u.email);
  });
});

describe('usuarioDelToken', () => {
  test('devuelve el id y el email que van dentro del token', async () => {
    const u = await usuario();

    const leido = await authService.usuarioDelToken(u.token);

    expect(leido.id).toBe(u.id);
    expect(leido.email).toBe(u.email);
  });

  test('falla con un token inventado', async () => {
    await expect(authService.usuarioDelToken('esto.no.es.un.jwt')).rejects.toThrow(
      ErrorDeServicio
    );
  });

  test('falla si no hay token', async () => {
    await expect(authService.usuarioDelToken(undefined)).rejects.toThrow(/token/i);
  });
});

describe('logout', () => {
  test('cierra la sesión sin error', async () => {
    const u = await usuarioRevocado();

    await expect(authService.logout(u.token)).resolves.toEqual({ cerrada: true });
  });

  test('el access token sigue siendo válido hasta que caduca', async () => {
    const u = await usuarioRevocado();

    await authService.logout(u.token);

    // Esto no es un fallo del servicio sino cómo funciona Supabase: `signOut`
    // revoca el refresh token, y los JWT son sin estado, así que el access token
    // que ya se emitió sigue aceptándose hasta que caduca (una hora por defecto).
    // Por eso hay una duración de vida corta y por eso el logout no basta como
    // medida de seguridad si hay un access token robado.
    const leido = await authService.usuarioDelToken(u.token);
    expect(leido.id).toBe(u.id);
  });
});

describe('actualizarPerfil', () => {
  test('cambia el nombre y la biografía', async () => {
    const u = await usuarioEditable();

    await perfilService.actualizarPerfil(
      { nombre: 'Nombre Nuevo', biografia: '  Hola, soy yo.  ' },
      u.contexto
    );

    const perfil = await perfilService.perfil({ token: u.token });

    expect(perfil.nombre).toBe('Nombre Nuevo');
    // El servicio recorta los espacios.
    expect(perfil.biografia).toBe('Hola, soy yo.');
  });

  test('deja la biografía a null si se manda una cadena en blanco', async () => {
    const u = await usuarioEditable();

    await perfilService.actualizarPerfil({ biografia: 'algo' }, u.contexto);
    await perfilService.actualizarPerfil({ biografia: '   ' }, u.contexto);

    const perfil = await perfilService.perfil({ token: u.token });
    expect(perfil.biografia).toBeNull();
  });

  test('rechaza cambiar el email, que es cosa de Supabase Auth', async () => {
    const u = await usuarioEditable();

    await expect(
      perfilService.actualizarPerfil({ email: 'otro@example.com' }, u.contexto)
    ).rejects.toThrow(/email/i);
  });

  test('rechaza una biografía de más de 500 caracteres', async () => {
    const u = await usuarioEditable();

    await expect(
      perfilService.actualizarPerfil({ biografia: 'a'.repeat(501) }, u.contexto)
    ).rejects.toThrow(/500/);
  });

  test('rechaza una actualización sin campos', async () => {
    const u = await usuarioEditable();

    await expect(perfilService.actualizarPerfil({}, u.contexto)).rejects.toThrow(ErrorDeServicio);
  });

  test('no deja editar el perfil de otro usuario', async () => {
    const [a, b] = await dosUsuarios();

    const nombreDeA = (await perfilService.perfil({ token: a.token })).nombre;

    // Se intenta escribir la fila de `a` con el token de `b`.
    await expect(
      perfilService.actualizarPerfil({ nombre: 'Hackeado' }, { token: b.token, usuarioId: a.id })
    ).rejects.toThrow(ErrorDeServicio);

    const perfilDeA = await perfilService.perfil({ token: a.token });
    expect(perfilDeA.nombre).toBe(nombreDeA);
  });
});

describe('perfilPublico', () => {
  test('devuelve id, nombre y biografía pero no el email', async () => {
    const u = await usuario();

    const publico = await perfilService.perfilPublico(u.id);

    expect(publico.id).toBe(u.id);
    expect(publico).not.toHaveProperty('email');
    expect(Object.keys(publico).sort()).toEqual(['biografia', 'fecha_alta', 'id', 'nombre']);
  });

  test('devuelve null si no hay nadie con ese id', async () => {
    await expect(
      perfilService.perfilPublico('00000000-0000-4000-8000-000000000000')
    ).resolves.toBeNull();
  });

  test('no necesita token: es una lectura pública', async () => {
    const u = await usuario();
    await expect(perfilService.perfilPublico(u.id)).resolves.toBeTruthy();
  });
});
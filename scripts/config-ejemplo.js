/**
 * Archivo de configuración de ejemplo
 * Copia este archivo como config.js y configura tus valores reales
 */

module.exports = {
  // Configuración de Supabase
  supabase: {
    url: 'https://tu-proyecto.supabase.co',
    serviceRoleKey: 'tu-service-role-key-aqui'
  },
  
  // Configuración del servidor
  server: {
    port: 3000,
    nodeEnv: 'development'
  },
  
  // Configuración del frontend
  frontend: {
    url: 'http://localhost:3001'
  }
};


import { supabaseAdmin } from '../../config/supabaseClient';
import { hashPassword } from '../../utils/passwordSecurity';
import { dashboardDesdeRoles, dashboardDesdeTipoUsuario } from './dashboard';

export interface UserRole {
  id: number;
  usuario_id: string; // UUID
  rol: string;
  activo: boolean;
  fecha_asignacion: string;
}

export interface CoordinadorInfo {
  id: number;
  usuario_id: string; // UUID
  carrera_id?: number;
  carrera_nombre?: string;
  departamento?: string;
  fecha_nombramiento?: string;
  activo: boolean;
  profesor_id?: number;
  profesor_activo?: boolean;
}

export class RoleService {
  // =====================================================
  // GESTIÓN DE ROLES MÚLTIPLES
  // =====================================================

  /**
   * Asignar un rol a un usuario
   */
  static async asignarRol(usuarioId: string, rol: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('usuario_roles')
        .upsert({
          usuario_id: usuarioId,
          rol: rol,
          activo: true,
          fecha_asignacion: new Date().toISOString()
        }, {
          onConflict: 'usuario_id,rol'
        });

      if (error) {
        console.error('Error asignando rol:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en asignarRol:', error);
      return false;
    }
  }

  /**
   * Remover un rol de un usuario
   */
  static async removerRol(usuarioId: string, rol: string): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('usuario_roles')
        .update({ activo: false })
        .eq('usuario_id', usuarioId)
        .eq('rol', rol);

      if (error) {
        console.error('Error removiendo rol:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en removerRol:', error);
      return false;
    }
  }

  /**
   * Obtener todos los roles activos de un usuario
   */
  static async obtenerRolesUsuario(usuarioId: string): Promise<string[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('usuario_roles')
        .select('rol')
        .eq('usuario_id', usuarioId)
        .eq('activo', true)
        .order('rol');

      if (error) {
        console.error('Error obteniendo roles:', error);
        return [];
      }

      return data?.map(item => item.rol) || [];
    } catch (error) {
      console.error('Error en obtenerRolesUsuario:', error);
      return [];
    }
  }

  /**
   * Verificar si un usuario tiene un rol específico
   */
  static async usuarioTieneRol(usuarioId: string, rol: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('usuario_roles')
        .select('id')
        .eq('usuario_id', usuarioId)
        .eq('rol', rol)
        .eq('activo', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error verificando rol:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error en usuarioTieneRol:', error);
      return false;
    }
  }

  // =====================================================
  // GESTIÓN DE COORDINADORES
  // =====================================================

  /**
   * Crear un coordinador que también es profesor
   */
  static async crearCoordinadorProfesor(coordinadorData: {
    email: string;
    password: string;
    nombre: string;
    apellido: string;
    carrera_id?: number;
    departamento?: string;
  }): Promise<{ success: boolean; usuario_id?: string; error?: string }> {
    try {
      const hashedPassword = await hashPassword(coordinadorData.password);

      // 1. Crear usuario
      const { data: usuario, error: usuarioError } = await supabaseAdmin
        .from('usuarios')
        .insert({
          email: coordinadorData.email,
          password: hashedPassword,
          nombre: coordinadorData.nombre,
          apellido: coordinadorData.apellido,
          tipo_usuario: 'profesor', // Tipo principal
          activo: true
        })
        .select('id')
        .single();

      if (usuarioError) {
        console.error('Error creando usuario:', usuarioError);
        return { success: false, error: 'Error creando usuario' };
      }

      const usuarioId = usuario.id;

      // 2. Asignar rol de profesor
      await this.asignarRol(usuarioId, 'profesor');

      // 3. Asignar rol de coordinador
      await this.asignarRol(usuarioId, 'coordinador');

      // 4. Crear registro en profesores (se hace automáticamente por trigger)
      // El trigger ya crea el registro en profesores cuando se inserta un usuario con tipo_usuario = 'profesor'

      // 5. Crear registro en coordinadores
      const { error: coordinadorError } = await supabaseAdmin
        .from('coordinadores')
        .insert({
          usuario_id: usuarioId,
          carrera_id: coordinadorData.carrera_id,
          departamento: coordinadorData.departamento,
          fecha_nombramiento: new Date().toISOString().split('T')[0],
          activo: true
        });

      if (coordinadorError) {
        console.error('Error creando coordinador:', coordinadorError);
        return { success: false, error: 'Error creando coordinador' };
      }

      return { success: true, usuario_id: usuarioId };
    } catch (error) {
      console.error('Error en crearCoordinadorProfesor:', error);
      return { success: false, error: 'Error interno del servidor' };
    }
  }

  /**
   * Obtener información completa de coordinadores
   */
  static async obtenerCoordinadores(): Promise<CoordinadorInfo[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('vista_coordinadores_completa')
        .select('*')
        .eq('coordinador_activo', true);

      if (error) {
        console.error('Error obteniendo coordinadores:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error en obtenerCoordinadores:', error);
      return [];
    }
  }

  /**
   * Obtener coordinador por ID de usuario
   */
  static async obtenerCoordinadorPorUsuario(usuarioId: string): Promise<CoordinadorInfo | null> {
    try {
      console.log('🔍 Buscando coordinador para usuario:', usuarioId)
      
      // Usar directamente la tabla coordinadores en lugar de la vista
      const { data, error } = await supabaseAdmin
        .from('coordinadores')
        .select('*')
        .eq('usuario_id', usuarioId)
        .eq('activo', true)
        .single();

      console.log('🔍 Query coordinador - data:', data)
      console.log('🔍 Query coordinador - error:', error)

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error obteniendo coordinador:', error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error('❌ Error en obtenerCoordinadorPorUsuario:', error);
      return null;
    }
  }

  // =====================================================
  // FUNCIONES DE UTILIDAD
  // =====================================================

  /**
   * Obtener el dashboard principal de un usuario basado en sus roles.
   * Si no tiene filas en usuario_roles, usa tipo_usuario de la tabla usuarios.
   */
  static async obtenerDashboardUsuario(usuarioId: string): Promise<string> {
    try {
      const roles = await this.obtenerRolesUsuario(usuarioId);

      const porRoles = dashboardDesdeRoles(roles)
      if (porRoles) return porRoles

      const { data: usuario, error } = await supabaseAdmin
        .from('usuarios')
        .select('tipo_usuario')
        .eq('id', usuarioId)
        .single();

      if (!error && usuario?.tipo_usuario) {
        return dashboardDesdeTipoUsuario(usuario.tipo_usuario)
      }

      return '/dashboard'
    } catch (error) {
      console.error('Error en obtenerDashboardUsuario:', error);
      return '/dashboard';
    }
  }

  /**
   * Obtener permisos de un usuario basado en sus roles
   */
  static async obtenerPermisosUsuario(usuarioId: string): Promise<string[]> {
    try {
      const roles = await this.obtenerRolesUsuario(usuarioId);
      const permisos = new Set<string>();

      roles.forEach(rol => {
        switch (rol) {
          case 'admin':
            permisos.add('all');
            break;
          case 'decano':
            permisos.add('view_evaluations');
            permisos.add('create_evaluations');
            permisos.add('view_reports');
            permisos.add('manage_users');
            permisos.add('manage_department');
            permisos.add('manage_faculty');
            permisos.add('view_all_professors');
            permisos.add('view_all_careers');
            break;
          case 'coordinador':
            permisos.add('view_evaluations');
            permisos.add('create_evaluations');
            permisos.add('view_reports');
            permisos.add('manage_users');
            permisos.add('manage_department');
            break;
          case 'profesor':
          case 'docente':
            permisos.add('view_evaluations');
            permisos.add('create_evaluations');
            permisos.add('view_reports');
            break;
          case 'estudiante':
            permisos.add('view_evaluations');
            permisos.add('submit_evaluations');
            break;
        }
      });

      return Array.from(permisos);
    } catch (error) {
      console.error('Error en obtenerPermisosUsuario:', error);
      return [];
    }
  }

  /**
   * Verificar si un usuario puede acceder a una funcionalidad
   */
  static async usuarioPuedeAcceder(usuarioId: string, permiso: string): Promise<boolean> {
    try {
      const permisos = await this.obtenerPermisosUsuario(usuarioId);
      return permisos.includes('all') || permisos.includes(permiso);
    } catch (error) {
      console.error('Error en usuarioPuedeAcceder:', error);
      return false;
    }
  }

  /**
   * Obtener información del decano por usuario
   */
  static async obtenerDecanoPorUsuario(usuarioId: string): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('decanos')
        .select(`
          id,
          usuario_id,
          facultad_id,
          fecha_nombramiento,
          activo,
          observaciones,
          facultades:facultades!facultad_id(
            id,
            nombre,
            codigo,
            descripcion
          )
        `)
        .eq('usuario_id', usuarioId)
        .eq('activo', true)
        .single()

      if (error) {
        console.error('Error obteniendo decano por usuario:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error en obtenerDecanoPorUsuario:', error)
      return null
    }
  }

  /**
   * Obtener decano activo de una facultad
   */
  static async obtenerDecanoFacultad(facultadId: number): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('decanos')
        .select(`
          id,
          usuario_id,
          facultad_id,
          fecha_nombramiento,
          activo,
          observaciones,
          usuarios:usuarios!usuario_id(
            id,
            nombre,
            apellido,
            email,
            activo
          ),
          facultades:facultades!facultad_id(
            id,
            nombre,
            codigo,
            descripcion
          )
        `)
        .eq('facultad_id', facultadId)
        .eq('activo', true)
        .eq('usuarios.activo', true)
        .single()

      if (error) {
        console.error('Error obteniendo decano de facultad:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error en obtenerDecanoFacultad:', error)
      return null
    }
  }
}

export default RoleService;



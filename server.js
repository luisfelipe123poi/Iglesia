const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// CONFIGURACIÓN DE CORS COMPLETA PARA EVITAR ERRORES 405 Y PREFLIGHT (OPTIONS)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret']
}));

// MANEJO EXPLÍCITO DE RESPUESTA PREFLIGHT PARA TODAS LAS RUTAS
app.options('*', cors());

// AUMENTAR LÍMITE PARA IMÁGENES EN BASE64 Y PETICIONES LARGAS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// CONEXIÓN ROBUSTA A MONGODB ATLAS
const RAW_MONGO_URI = process.env.MONGO_URI || "mongodb+srv://garciaborjabertha_db_user:ZA1QzbIcKgPs0SkV@cluster0.ywee9hu.mongodb.net/iglesia_db?appName=Cluster0";
const MONGO_URI = RAW_MONGO_URI.replace(/['"]+/g, '').trim();

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error de conexión:', err));

// Clave secreta para proteger acciones del Admin
const ADMIN_SECRET = process.env.ADMIN_SECRET || "ClaveSecretaIglesia2026";

// FUNCIÓN AUXILIAR PARA EXTRAER EL ID DE YOUTUBE DE CUALQUIER URL
function extractYouTubeId(urlOrId) {
    if (!urlOrId) return "dQw4w9WgXcQ";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = urlOrId.match(regExp);
    return (match && match[2].length === 11) ? match[2] : urlOrId.trim();
}

// ================= MODELOS DE DATOS =================

const ActividadSchema = new mongoose.Schema({
    dia: String,
    diaSemana: String,
    hora: String,
    horaInicio: String,
    actividad: String,
    titulo: String,
    plataforma: String,
    link: String,
    linkTransmision: String,
    estado: String,
    
    // Almacena las cadenas Base64 de las imágenes subidas
    imagenUrl: String,       
    oradorFotoUrl: String,   
    nombreOrador: String,    
    esInvitado: { type: Boolean, default: false }, 
    descripcion: String      
}, { timestamps: true });

const BannerSchema = new mongoose.Schema({
    activo: Boolean,
    link: String,
    mensaje: String
});

const MediaSchema = new mongoose.Schema({
    youtubeVideoId: { type: String, default: 'dQw4w9WgXcQ' }
}, { timestamps: true });

// NUEVO: ESQUEMA PARA PETICIONES DE ORACIÓN
const PeticionOracionSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    email: { type: String, default: '' },
    telefono: { type: String, default: '' },
    peticion: { type: String, required: true },
    esPrivado: { type: Boolean, default: false },
    estado: { 
        type: String, 
        enum: ['pendiente', 'en_oracion', 'respondida', 'archivada'], 
        default: 'pendiente' 
    },
    respuestaAdmin: { type: String, default: '' }
}, { timestamps: true });

const Actividad = mongoose.model('Actividad', ActividadSchema);
const Banner = mongoose.model('Banner', BannerSchema);
const Media = mongoose.model('Media', MediaSchema);
const PeticionOracion = mongoose.model('PeticionOracion', PeticionOracionSchema);

// Middleware para verificar clave Admin
const checkAuth = (req, res, next) => {
    // Permitir solicitudes preflight OPTIONS sin verificar el header
    if (req.method === 'OPTIONS') {
        return next();
    }
    const secret = req.headers['x-admin-secret'];
    if (secret === ADMIN_SECRET) {
        next();
    } else {
        res.status(401).json({ error: 'Acceso no autorizado' });
    }
};

// ================= RUTAS PÚBLICAS =================

app.get('/api/actividades', async (req, res) => {
    try {
        const actividades = await Actividad.find().sort({ createdAt: -1 });
        res.json(actividades);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/banner', async (req, res) => {
    try {
        let banner = await Banner.findOne();
        if (!banner) {
            banner = await Banner.create({ 
                activo: false, 
                link: 'https://youtube.com', 
                mensaje: '¡Estamos transmitiendo en vivo ahora!' 
            });
        }
        res.json(banner);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta pública para obtener el video de la semana actual
app.get('/api/media/weekly-video', async (req, res) => {
    try {
        let media = await Media.findOne();
        if (!media) {
            media = await Media.create({ youtubeVideoId: 'dQw4w9WgXcQ' });
        }
        res.json({ success: true, videoId: media.youtubeVideoId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RUTAS PÚBLICAS DE PETICIONES DE ORACIÓN

// Crear nueva petición desde la web pública
app.post('/api/peticiones', async (req, res) => {
    try {
        const { nombre, email, telefono, peticion, esPrivado } = req.body;
        
        if (!nombre || !peticion) {
            return res.status(400).json({ error: 'Nombre y petición son campos requeridos.' });
        }

        const nuevaPeticion = await PeticionOracion.create({
            nombre,
            email: email || '',
            telefono: telefono || '',
            peticion,
            esPrivado: !!esPrivado
        });

        res.status(201).json({
            success: true,
            message: 'Petición de oración enviada correctamente',
            data: nuevaPeticion
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener solo peticiones públicas para mostrar testimonial o muro de oración en la web (Opcional)
app.get('/api/peticiones/publicas', async (req, res) => {
    try {
        const peticiones = await PeticionOracion.find({ esPrivado: false })
            .select('nombre peticion createdAt estado')
            .sort({ createdAt: -1 });
        res.json(peticiones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= RUTAS PRIVADAS (ADMIN) =================

// ----- ACTIVIDADES -----

app.post('/api/actividades', checkAuth, async (req, res) => {
    try {
        const { 
            id, dia, diaSemana, hora, horaInicio, actividad, titulo, 
            plataforma, link, linkTransmision, estado, 
            imagenUrl, oradorFotoUrl, nombreOrador, esInvitado, descripcion 
        } = req.body;

        const data = {
            dia: diaSemana || dia,
            diaSemana: diaSemana || dia,
            hora: horaInicio || hora,
            horaInicio: horaInicio || hora,
            actividad: titulo || actividad,
            titulo: titulo || actividad,
            plataforma,
            link: linkTransmision || link,
            linkTransmision: linkTransmision || link,
            estado,
            imagenUrl: imagenUrl || '',
            oradorFotoUrl: oradorFotoUrl || '',
            nombreOrador: nombreOrador || '',
            esInvitado: !!esInvitado,
            descripcion: descripcion || ''
        };

        if (id) {
            const actualizada = await Actividad.findByIdAndUpdate(id, data, { new: true });
            return res.json(actualizada);
        }

        const nueva = await Actividad.create(data);
        res.json(nueva);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/actividades/:id', checkAuth, async (req, res) => {
    try {
        const { 
            dia, diaSemana, hora, horaInicio, actividad, titulo, 
            plataforma, link, linkTransmision, estado, 
            imagenUrl, oradorFotoUrl, nombreOrador, esInvitado, descripcion 
        } = req.body;

        const data = {
            dia: diaSemana || dia,
            diaSemana: diaSemana || dia,
            hora: horaInicio || hora,
            horaInicio: horaInicio || hora,
            actividad: titulo || actividad,
            titulo: titulo || actividad,
            plataforma,
            link: linkTransmision || link,
            linkTransmision: linkTransmision || link,
            estado,
            imagenUrl: imagenUrl || '',
            oradorFotoUrl: oradorFotoUrl || '',
            nombreOrador: nombreOrador || '',
            esInvitado: !!esInvitado,
            descripcion: descripcion || ''
        };

        const actualizada = await Actividad.findByIdAndUpdate(req.params.id, data, { new: true });
        if (!actualizada) {
            return res.status(404).json({ error: 'Actividad no encontrada' });
        }
        res.json(actualizada);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/actividades/:id', checkAuth, async (req, res) => {
    try {
        const eliminada = await Actividad.findByIdAndDelete(req.params.id);
        if (!eliminada) {
            return res.status(404).json({ error: 'Actividad no encontrada' });
        }
        res.json({ message: 'Actividad eliminada correctamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----- BANNER -----

app.post('/api/banner', checkAuth, async (req, res) => {
    try {
        const { activo, link, mensaje } = req.body;
        let banner = await Banner.findOne();
        if (banner) {
            banner.activo = activo;
            banner.link = link;
            if (mensaje) banner.mensaje = mensaje;
            await banner.save();
        } else {
            banner = await Banner.create({ activo, link, mensaje });
        }
        res.json(banner);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----- MEDIA / VIDEO DE LA SEMANA -----

app.post('/api/media/weekly-video', checkAuth, async (req, res) => {
    try {
        const { videoUrlOrId } = req.body;
        const videoId = extractYouTubeId(videoUrlOrId);

        let media = await Media.findOne();
        if (media) {
            media.youtubeVideoId = videoId;
            await media.save();
        } else {
            media = await Media.create({ youtubeVideoId: videoId });
        }

        res.json({ 
            success: true, 
            message: 'Video de la semana actualizado correctamente', 
            videoId: media.youtubeVideoId 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----- PETICIONES DE ORACIÓN (PANEL ADMIN) -----

// Obtener todas las peticiones (con opción de filtrado por estado)
app.get('/api/admin/peticiones', checkAuth, async (req, res) => {
    try {
        const { estado } = req.query;
        const query = estado ? { estado } : {};
        const peticiones = await PeticionOracion.find(query).sort({ createdAt: -1 });
        res.json(peticiones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar estado o agregar respuesta a una petición
app.put('/api/admin/peticiones/:id', checkAuth, async (req, res) => {
    try {
        const { estado, respuestaAdmin } = req.body;
        const updateData = {};
        
        if (estado) updateData.estado = estado;
        if (respuestaAdmin !== undefined) updateData.respuestaAdmin = respuestaAdmin;

        const actualizada = await PeticionOracion.findByIdAndUpdate(
            req.params.id, 
            updateData, 
            { new: true }
        );

        if (!actualizada) {
            return res.status(404).json({ error: 'Petición no encontrada' });
        }
        res.json(actualizada);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar una petición
app.delete('/api/admin/peticiones/:id', checkAuth, async (req, res) => {
    try {
        const eliminada = await PeticionOracion.findByIdAndDelete(req.params.id);
        if (!eliminada) {
            return res.status(404).json({ error: 'Petición no encontrada' });
        }
        res.json({ message: 'Petición eliminada correctamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Resumen / Métricas para el Panel Admin
app.get('/api/admin/peticiones/stats', checkAuth, async (req, res) => {
    try {
        const total = await PeticionOracion.countDocuments();
        const pendientes = await PeticionOracion.countDocuments({ estado: 'pendiente' });
        const enOracion = await PeticionOracion.countDocuments({ estado: 'en_oracion' });
        const respondidas = await PeticionOracion.countDocuments({ estado: 'respondida' });

        res.json({ total, pendientes, enOracion, respondidas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= INICIALIZACIÓN DEL SERVIDOR =================

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor corriendo en el puerto ${PORT}`));

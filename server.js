const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// CONEXIÓN ROBUSTA A MONGODB ATLAS
// Limpia comillas dobles, simples y espacios accidentales del env o string por defecto
const RAW_MONGO_URI = process.env.MONGO_URI || "mongodb+srv://garciaborjabertha_db_user:ZA1QzbIcKgPs0SkV@cluster0.ywee9hu.mongodb.net/iglesia_db?appName=Cluster0";
const MONGO_URI = RAW_MONGO_URI.replace(/['"]+/g, '').trim();

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error de conexión:', err));

// Clave secreta para proteger acciones del Admin
const ADMIN_SECRET = process.env.ADMIN_SECRET || "ClaveSecretaIglesia2026";

// MODELOS DE DATOS
const ActividadSchema = new mongoose.Schema({
    dia: String,         // Ej: "Domingo", "Especial"
    hora: String,        // Ej: "07:00 PM"
    actividad: String,   // Ej: "Culto Celebrativo"
    plataforma: String,  // Ej: "YouTube Live", "Zoom"
    link: String,        // Ej: "https://..."
    estado: String       // "EN VIVO", "PROXIMAMENTE", "CANCELADA"
}, { timestamps: true });

const BannerSchema = new mongoose.Schema({
    activo: Boolean,
    link: String,
    mensaje: String
});

const Actividad = mongoose.model('Actividad', ActividadSchema);
const Banner = mongoose.model('Banner', BannerSchema);

// Middleware para verificar clave Admin
const checkAuth = (req, res, next) => {
    const secret = req.headers['x-admin-secret'];
    if (secret === ADMIN_SECRET) {
        next();
    } else {
        res.status(401).json({ error: 'Acceso no autorizado' });
    }
};

// ================= RUTAS PÚBLICAS (Para la Web) =================

// Obtener todas las actividades
app.get('/api/actividades', async (req, res) => {
    try {
        const actividades = await Actividad.find().sort({ createdAt: -1 });
        res.json(actividades);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener estado del Banner En Vivo
app.get('/api/banner', async (req, res) => {
    try {
        let banner = await Banner.findOne();
        if (!banner) {
            banner = await Banner.create({ activo: false, link: 'https://youtube.com', mensaje: '¡Estamos transmitiendo en vivo ahora!' });
        }
        res.json(banner);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= RUTAS PRIVADAS (Para el Admin) =================

// Crear o Actualizar Actividad
app.post('/api/actividades', checkAuth, async (req, res) => {
    try {
        const { id, dia, hora, actividad, plataforma, link, estado } = req.body;
        if (id) {
            const actualizada = await Actividad.findByIdAndUpdate(id, { dia, hora, actividad, plataforma, link, estado }, { new: true });
            return res.json(actualizada);
        }
        const nueva = await Actividad.create({ dia, hora, actividad, plataforma, link, estado });
        res.json(nueva);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar Actividad
app.delete('/api/actividades/:id', checkAuth, async (req, res) => {
    try {
        await Actividad.findByIdAndDelete(req.params.id);
        res.json({ message: 'Actividad eliminada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar Banner En Vivo
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));

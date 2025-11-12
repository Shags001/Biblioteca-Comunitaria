document.addEventListener('DOMContentLoaded', function() {
    
    // Obtener el formulario de devolución
    const formDevolucion = document.getElementById('formDevolucion');

    // Escuchar el evento de envío del formulario
    formDevolucion.addEventListener('submit', function(e) {
        e.preventDefault(); // Evita quge el formulario se envíe de forma tradicional

       
        const idLibro = document.getElementById('idLibro').value;
        const fechaDevolucion = document.getElementById('fechaDevolucion').value;
        const estadoDevolucion = document.getElementById('estadoDevolucion').value;
        
        
        // Simulación de respuesta al usuario (Tono amigable: "¡Listo! Libro agregado")
        alert('¡Listo! Devolución registrada con éxito. La cantidad de libros disponibles ha sido actualizada.');
        
        // Cerrar el modal (Necesita que Bootstrap esté cargado)
        const modalElement = document.getElementById('devolucionModal');
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
            modal.hide();
        } else {
            // Si el modal no se instancia correctamente, usa jQuery o re-inicializa si es necesario
            new bootstrap.Modal(modalElement).hide();
        }
        
        
    });
});
(function () {
  "use strict";

  const CLAVE = "lista-de-tareas";

  const formulario = document.getElementById("formulario");
  const entrada = document.getElementById("nueva-tarea");
  const lista = document.getElementById("lista");
  const contador = document.getElementById("contador");
  const vacio = document.getElementById("vacio");
  const limpiar = document.getElementById("limpiar");

  let tareas = cargar();

  function cargar() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE));
      return Array.isArray(datos) ? datos : [];
    } catch (e) {
      return [];
    }
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(tareas));
    } catch (e) {
      // Almacenamiento no disponible (p. ej. modo privado): la lista sigue funcionando en memoria.
    }
  }

  function nuevoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function crearElemento(tarea) {
    const li = document.createElement("li");
    li.className = "tarea" + (tarea.hecha ? " hecha" : "");
    li.dataset.id = tarea.id;

    const label = document.createElement("label");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = tarea.hecha;

    const texto = document.createElement("span");
    texto.className = "texto";
    texto.textContent = tarea.texto;

    label.append(check, texto);

    const borrar = document.createElement("button");
    borrar.type = "button";
    borrar.className = "borrar";
    borrar.setAttribute("aria-label", "Borrar tarea: " + tarea.texto);
    borrar.textContent = "×";

    li.append(label, borrar);
    return li;
  }

  function mostrar() {
    lista.replaceChildren(...tareas.map(crearElemento));

    const pendientes = tareas.filter((t) => !t.hecha).length;
    const hechas = tareas.length - pendientes;

    contador.textContent = pendientes === 1 ? "1 pendiente" : pendientes + " pendientes";
    vacio.hidden = tareas.length > 0;
    limpiar.hidden = hechas === 0;
  }

  formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();
    const texto = entrada.value.trim();
    if (!texto) return;

    tareas.push({ id: nuevoId(), texto: texto, hecha: false });
    guardar();
    mostrar();
    entrada.value = "";
    entrada.focus();
  });

  lista.addEventListener("change", function (evento) {
    if (evento.target.type !== "checkbox") return;
    const id = evento.target.closest(".tarea").dataset.id;
    const tarea = tareas.find((t) => t.id === id);
    if (!tarea) return;

    tarea.hecha = evento.target.checked;
    guardar();
    mostrar();
  });

  lista.addEventListener("click", function (evento) {
    const boton = evento.target.closest(".borrar");
    if (!boton) return;
    const id = boton.closest(".tarea").dataset.id;

    tareas = tareas.filter((t) => t.id !== id);
    guardar();
    mostrar();
  });

  limpiar.addEventListener("click", function () {
    tareas = tareas.filter((t) => !t.hecha);
    guardar();
    mostrar();
  });

  mostrar();
})();

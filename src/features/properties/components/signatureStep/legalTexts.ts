// filepath: src/features/properties/components/signatureStep/legalTexts.ts
/**
 * Textos jurídicos obligatorios del inventario. La marca "{empresa}" se
 * reemplaza en runtime con el nombre configurado en Settings → Información
 * de Agencia. Mantener este bloque sincronizado con el documento legal de
 * la inmobiliaria.
 */
export const LEGAL_TEXTS: Array<{ title: string; body: string }> = [
  {
    title: "Declaración de entrega",
    body: "Declaramos expresamente las partes que el (la) {propertyType} ha sido entregado al arrendatario o a quien éste ha delegado para recibirlo, conforme al presente inventario. Acorde con el contrato de arrendamiento, los arrendatarios se comprometen a conservar y mantener el inmueble y su correspondiente dotación en el mismo estado en el que lo reciben, salvo los deterioros naturales originados en el uso decente del mismo, así como a arreglar los daños resultantes del mal trato o del descuido en el lapso de la tenencia. Si esos arreglos no se hicieren queda {empresa} autorizado para hacerlos por su cuenta y para cobrar ejecutivamente las sumas correspondiente a los arrendatarios, para este efecto convienen las partes que las facturas de reparación de daños o de reposición de faltantes junto con el contrato de arrendamiento prestan merito ejecutivo suficiente.",
  },
  {
    title: "Aire Acondicionado",
    body: "En caso de que el(la) {propertyType} este dotado con uno o mas equipos de aire acondicionado, sus respectivas conexión y unidades de condensación, realizare los mantenimientos periódicos pertinentes para su correcto funcionamiento.",
  },
  {
    title: "Calentadores",
    body: "En caso de que el(la) {propertyType} este dotado con uno o mas calentadores de agua ya sea a gas o eléctrico, sus respectivas conexión y baterías, realizare los mantenimientos periódicos pertinentes para su correcto funcionamiento.",
  },
  {
    title: "Estufas y hornos",
    body: "En caso de que el(la) {propertyType} este dotado con uno o mas estufas y hornos de cocina, realizare los mantenimientos periodicos pertinentes para su correcto funcionamiento.",
  },
  {
    title: "Extractores de cocina",
    body: "En caso de que el inmueble este dotado con uno o mas extractores de cocina, realizare los mantenimientos periódicos pertinentes para su correcto funcionamiento y cambio periódico de filtro.",
  },
  {
    title: "Plazo para reportar anomalías",
    body: "A partir de la fecha, el inquilino cuenta con 15 días calendario para reportar cualquier anomalía o avería en el inmueble.",
  },
];

/** Etiqueta legible por tipo de propiedad (para sustitución en LEGAL_TEXTS). */
export const PROPERTY_TYPE_LABEL: Record<string, string> = {
  apartaestudio: "apartaestudio",
  apartamento: "apartamento",
  casa: "casa",
  oficina: "oficina",
  local: "local",
  bodega: "bodega",
};

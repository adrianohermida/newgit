// Adicione esta linha ao seu _app.js, _document.js ou layout global para Material Icons:
// <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">

// Exemplo de uso em JSX:
// <span className="material-icons">send</span>
// <span className="material-icons">folder</span>
// <span className="material-icons">add</span>
// <span className="material-icons">chat</span>

// Sugestão: criar um componente Icon para facilitar troca de tema/estilo

export function Icon({ name, className = "", ...props }) {
  return <span className={`material-icons ${className}`} {...props}>{name}</span>;
}

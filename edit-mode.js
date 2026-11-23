const key='ees-edit-mode';
export function isEditing(){try{return sessionStorage.getItem(key)==='on';}catch{return false;}}
export function setEditing(enabled){try{if(enabled)sessionStorage.setItem(key,'on');else sessionStorage.removeItem(key);}catch{return false;}sync();return true;}
export function requireEditing(){if(!isEditing())throw new Error('Включите режим редактирования в настройках.');}
function sync(){document.documentElement.dataset.editMode=isEditing()?'on':'off';}
sync();

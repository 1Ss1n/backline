# Backline — bilan de la refonte RewampUI

## Composants réellement intégrés

Les sources publiques ont été consultées avant adaptation. Les liens exacts et
les choix techniques figurent dans [la documentation des composants](src/components/rewamp/README.md).
Il s'agit de composants locaux adaptés au projet, pas d'un package npm RewampUI.

| Composant | Fichier | Écrans et adaptation |
| --- | --- | --- |
| Soft Aurora | src/components/rewamp/SoftAurora.jsx | Fond commun du studio et de l'authentification ; shader original adapté au vert Backline et à l'indigo |
| Landscape Orb Toggle | src/components/rewamp/LandscapeOrbToggle.jsx | Globe jour/nuit de 40 px à côté du logo et sur la connexion |
| Word by Word | src/components/rewamp/WordByWord.jsx | Paroles du karaoké et des performances, avec lecture du temps audio réel |
| Folder Tab Card | src/components/rewamp/FolderTabCard.jsx | Mes morceaux et Mes performances ; silhouette originale en dossier, navigation au clic |

Pas de nouvelle dépendance de production : les transitions Motion et les
classes Tailwind des démos sont adaptées en CSS. Lucide et le bouton
ObsidianUI déjà présent sont conservés. Playwright est ajouté uniquement pour les tests.

## Soft Aurora

- Sombre : charbon, accent lime existant, lumière indigo/violette discrète.
- Clair : blancs et verts pâles, texte vert forêt ; pas une inversion du sombre.
- Shader calculé seulement au redimensionnement/changement de thème, puis
  mouvement CSS lent. Aucun rendu React continu pour ce fond.
- Résolution plafonnée, animation figée sur mobile, pendant le karaoké et dans
  Lyrics Studio. Intensité réduite sur les écrans de chant et d'édition.
- Respect de prefers-reduced-motion et fond de secours sans WebGL.

## Thème réel

Le globe pilote le même état depuis AuthApp, transmis au studio.
La clé existante backline-theme est conservée, avec persistance, synchronisation
entre onglets et gestion du stockage indisponible.
Le globe reste masqué quand la sidebar est réduite.

## Paroles et fluidité

La ligne précédente, la ligne active dominante et la suivante sont affichées.
Les vrais timings de mots sont utilisés lorsqu'ils sont présents et cohérents.
Sinon, la progression visuelle est répartie dans la fenêtre de la ligne,
sans modifier les données enregistrées.

Pour éviter les saccades dues à timeupdate, une boucle isolée lit audio.currentTime
au rythme de l'écran et actualise uniquement les styles des mots. Elle ne provoque
pas de rendu React du player ou de Perfect Pitch à chaque image. Elle s'arrête
à la pause, en fin de lecture et lorsque l'onglet est masqué.

Seek avant/arrière, redémarrage et décalage manuel des paroles restent reliés
à l'audio. Les lignes vides volontaires sont respectées. Le mode mouvement
réduit retire les déplacements des mots, pas leur synchronisation.

## Collections

Chaque carte est un bouton accessible au clavier, entièrement cliquable.
Le clic ouvre la session ou la performance existante : aucun dossier ne se déplie.
Titre, artiste, couverture et date disponibles sont utilisés, avec illustration
de secours si la couverture manque ou échoue. Aucun score fictif.
Le partage des performances reste dans sa rubrique existante.

## Autres changements et derniers ajustements

- Import : hiérarchie typographique revue, modes de chant lisibles et vraies
  étapes de traitement visibles également sur téléphone.
- Player : paroles prioritaires, progression distincte, console de mixage
  compacte et vraies icônes de lecture/pause.
- Connexion/inscription, profil et enveloppe de Lyrics Studio harmonisés.
- Profil sur toute la largeur et la hauteur disponibles, sans encart limité
  à 1320 px. Colonnes empilées sur téléphone.
- Sidebar fixe, dépliable au survol ou au clavier ; sélection réduite carrée
  de 44 × 44 px, menu mobile avec fermeture Échap et gestion du focus.
- Logo rétabli, notifications à droite, défilement remis en haut à la navigation.
- Aucun changement du backend, du pitch detector, du calcul des scores,
  de la séparation ou de l'authentification.

## Vérification

Résultats : 17 tests unitaires réussis, 17 tests navigateur réussis,
build de production réussi et git diff --check sans erreur.

Commandes depuis frontend :

    npm test
    npm run test:ui
    npm run build

La suite navigateur couvre :

- 1440, 1024, 768 et 390 px, en clair et sombre ;
- import, collections, karaoké, Perfect Pitch, Lyrics Studio, profil et auth ;
- persistance du thème, navigation clavier, notifications et menu mobile ;
- lecture/pause, seek, volumes des deux pistes, fin et reprise ;
- lignes vides, sauvegarde, progression fluide des mots, mouvement réduit ;
- activation/refus/désactivation du micro simulé, fin et reprise Perfect Pitch ;
- enregistrement synchronisé, verrouillage pause/seek et écoute après sauvegarde ;
- largeur du profil et sélection carrée de la sidebar.

Les API sont interceptées dans les tests et les fichiers WAV générés en mémoire :
aucun compte ni morceau réel n'est modifié. Captures dans test-output/browser.

Limites : tests Chromium avec microphone simulé, pas une validation sur appareil
iOS/Safari physique ni un test bout-en-bout des services IA/SMTP. Les avertissements
de dépréciation Vite 8/plugin React 4 préexistants restent non bloquants.
Pas de commit ni de push.

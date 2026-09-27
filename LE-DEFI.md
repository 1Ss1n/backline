# Le Défi — intégration V1

## Utilisation

Redémarrer le backend et Vite (nouvelle route WebSocket), puis recharger les clients.

1. Deux comptes vérifiés doivent être amis dans Backline.
2. Dans **Mes amis**, cliquer **Défier**, sélectionner son morceau préparé avec Perfect Pitch, puis **Envoyer le défi**.
3. L’autre compte retrouve l’invitation dans les notifications existantes et dans **Mes défis**. Il peut accepter ou refuser.
4. Chacun ouvre **Préparer ma performance**, sélectionne le micro PC ou téléphone, puis **Enregistrer**, **Lecture**. Le compte à rebours précède le départ des pistes et de l’enregistrement. Il faut chanter jusqu’à la fin.
5. Le premier participant voit son résultat et attend l’autre. Les résultats et l’écoute adverse sont révélés uniquement après les deux soumissions.
6. **Revanche** crée un nouveau round sur la même référence. **Choisir mon morceau et défier…** ouvre la bibliothèque de l’utilisateur courant et crée un contre-défi.

L’enregistrement du défi est privé et consultable dans le défi. Il n’est pas automatiquement publié sur le profil. Le karaoké classique continue à sauvegarder dans Mes performances comme auparavant.

## Audit et réutilisation

L’existant utilise Express, des fichiers JSON pour utilisateurs/relations/sessions, des cookies de session, React avec navigation par état, les composants Rewamp du dépôt, et WebRTC/`ws` pour Phone Micro. Il n’y a pas de base SQL ni de bus global de notifications : les demandes d’amis alimentaient le panneau de notifications.

Réutilisés : `areFriends`, utilisateurs/authentification, bibliothèque, `FolderTabCard`, `Player`, paroles, `PerfectPitchPanel`, `usePerfectPitchScoring`, `usePerformanceRecording`, Phone Micro et `SharedPerformancePlayer` (waveform, pause, seek et deux volumes). Aucun second lecteur ou détecteur de pitch n’a été créé. La capture et le transport microphone préexistants sont conservés.

## Data model

- `backend/storage/challenges/challenges.json` contient les challenges, snapshots légers, tentatives et performances.
- Challenge : UUID, participants, trackId, statut, dates, parentChallengeId, seriesId, performances indexées par utilisateur.
- Snapshot : titre/artiste/cover, paroles, notes Perfect Pitch, identifiant, hash du contenu, version du scoring et empreinte des configurations scoring/pitch. Une modification Lyrics Studio ou une nouvelle analyse ne modifie pas un défi existant.
- Pistes : liens physiques dans le répertoire du snapshot, sans nouvelle copie des WAV quand le filesystem le permet. Repli vers une copie uniquement si les hard links sont incompatibles (volumes différents, stockage synchronisé, etc.). Le nettoyage de la bibliothèque ne casse pas le défi. Une erreur de création empêche le défi d’être publié.
- Performance : identifiant/owner, fichier voix, date, durée, compteurs disponibles, combo maximal, score recalculé, rang, version.
- Série : relation `seriesId` commune et `parentChallengeId` vers le round précédent ; pas de table ni d’algorithme supplémentaire.
- Notifications d’invitation : dérivées des challenges persistés, affichées dans le panneau existant. Les mises à jour des défis et résultats arrivent aussi par WebSocket ; une relecture périodique et à la reconnexion assure le rattrapage. Pas de notification persistante à chaque événement ICE.

## Backend et autorisations

Routes `/api/challenges` :

- GET / et /:id : liste/detail filtrés pour le participant ; résultat adverse masqué avant COMPLETED.
- POST / : création commune aux défis, revanches (`rematch: true`) et contre-défis (`parentChallengeId` + trackId).
- POST /:id/accept, /decline, /cancel : transitions validées côté serveur.
- GET /:id/session : projection du snapshot pour le lecteur existant.
- POST /:id/ready : signal Prêt volontaire, valable deux minutes, sans départ distant ; POST /:id/start : tentative fraîche, liée au compte et au round.
- POST /:id/performances : upload multipart limité à 100 Mo, statistiques contrôlées et fichier lié à la tentative.
- GET /:id/performances/:performanceId/audio : uniquement son audio ou, après COMPLETED, celui de son adversaire.
- GET /:id/stems/:kind : uniquement les participants autorisés ; support des requêtes Range par Express.

Les références audio ne sont jamais exposées via un répertoire statique public. Les contrôles portent sur authentification, origine des mutations, amitié, propriété, participants, parent, état et expiration. L’API ne fait pas confiance au trackId du client. L’amitié est revérifiée à la création, au démarrage, à la soumission et pour le signaling ; un compte disparu/non vérifié ne peut plus interagir. L’application existante n’a pas de modèle « block » : aucun système de blocage fictif n’a été ajouté.

Transitions centralisées : PENDING → ACCEPTED/DECLINED/CANCELLED/EXPIRED ; ACCEPTED → IN_PROGRESS/CANCELLED ; IN_PROGRESS → WAITING_FOR_OPPONENT/CANCELLED ; WAITING_FOR_OPPONENT → COMPLETED/CANCELLED. L’historique n’est pas supprimé lors d’un abandon.

Expiration configurée une fois par `CHALLENGE_EXPIRY_DAYS` (7 par défaut), calculée côté serveur. Création limitée à 20 défis par heure et par utilisateur, revanches comprises ; doublon PENDING identique renvoie le défi existant. Limites additionnelles sur démarrages, uploads et signaling. Une seule performance par participant/round ; un retry renvoie la performance existante. Une nouvelle tentative invalide l’ancienne (protection deux onglets).

### Cohérence du stockage

Mutations synchrones et remplacement atomique d’un unique fichier JSON : la deuxième performance et COMPLETED sont publiés ensemble, dans le processus Node actuel. Le fichier audio est écrit avant la publication des métadonnées. Un crash entre les deux peut laisser un fichier orphelin, pas un résultat publié sans audio. Ce n’est **pas** une transaction distribuée : avant plusieurs workers/serveurs, migrer vers une DB transactionnelle avec contrainte unique `(challengeId, userId)`. Aucune base existante n’a été migrée.

### Scoring

Le moteur et la formule sont ceux de Perfect Pitch. Le backend importe les utilitaires existants, recalcule les points à partir des compteurs, contrôle bornes/combo/version/durée et compte les notes non évaluées comme Miss pour ne pas avantager une prise partielle. Le frontend extrait le dernier résultat synchronement à la fin, avant d’arrêter le microphone. Un changement d’empreinte/version refuse une tentative devenue incompatible.

Les mesures et les compteurs restent fournis par le navigateur : un client malveillant peut les fabriquer, ou soumettre un audio qui ne correspond pas à sa déclaration. Les contrôles de durée et de cohérence ne sont pas une vérification acoustique. Pas d’anti-cheat, de classement mondial ou de reconnaissance vocale ajouté.

## Frontend

Bouton Défier dans Mes amis ; sélection depuis sa bibliothèque ; invitations dans le panneau existant ; Mes défis organisé en À jouer / En attente / Terminés ; room dédiée ; lecteur existant en mode défi ; compte à rebours ; score individuel et attente ; révélation légère ; écoute waveform voix + instrumental ; revanche ; contre-défi ; historique repliable.

Les résultats de série comptent les rounds gagnés, jamais la somme de scores entre chansons. Une égalité ne donne de victoire à personne. Le contre-défi est accessible aux deux participants et utilise toujours la bibliothèque du compte courant.

Les boutons ont labels/focus visibles, états textuels, et l’animation respecte `prefers-reduced-motion`. Layouts testés à 1440/1024/768/390 en clair et sombre. La caméra est petite, masquable et distincte des paroles. Il n’existe pas de démarrage distant automatique : chaque participant déclenche sa propre prise.

## Realtime et WebRTC

Le serveur HTTP/`ws`, la configuration STUN/TURN et le limiteur Phone Micro sont réutilisés. Le chemin `/api/challenges/socket` ajoute un protocole adapté aux comptes authentifiés ; il ne réutilise pas les codes de pairing anonymes du téléphone. Vite relaie aussi ce chemin en WebSocket.

Messages : `challenges-changed` (rattrapage API), `join`, `joined`, `peer-ready`, `peer-left`, `offer`, `answer`, `ice`, `leave`, `error`/`replaced`. Chaque join/relay vérifie session authentifiée, origine, appartenance au défi, amitié et état. Une connexion vidéo par compte/room, taille/rate limit bornés et heartbeat. Aucun token, SDP, audio ou vidéo n’est journalisé.

Caméra **off par défaut**. Permission uniquement au clic, contraintes vidéo 320×180 / 15 fps souhaités (20 max), `audio: false`. Les SDP audio sont rejetés sur cette room : pas de deuxième microphone ni de voix distante dans les haut-parleurs. Vidéo WebRTC éphémère, jamais envoyée à MediaRecorder ni stockée.

Les credentials TURN sont temporaires et dérivés côté serveur de `WEBRTC_TURN_SECRET`, comme Phone Micro. Aucune nouvelle clé nécessaire. Un tunnel HTTP ne remplace pas TURN pour des réseaux bloquant les connexions pair-à-pair.

Le bouton Reconnecter relance la caméra sans toucher au karaoké. Une déconnexion ferme ses tracks ; les enregistrements/scoring continuent. Pas de mécanisme de synchronisation des lecteurs à la milliseconde. La présence affichée concerne la connexion vidéo, pas un statut global « utilisateur en ligne ». **Je suis prêt** permet de signaler volontairement sa disponibilité pendant deux minutes dans la room, même sans caméra ; le consentement au départ reste Enregistrer puis Lecture. Pas d’adaptation automatique avancée à la congestion réseau dans cette V1.

## Tests et vérification

Commandes :

```powershell
cd backend
npm test
cd ../frontend
npm test
npm run test:ui
npm run test:phone
npm run test:challenges
npm run build
```

Les fixtures backend/navigateur sont isolées : comptes fictifs et répertoires temporaires, aucune lecture/écriture des vrais comptes ou enregistrements. Tests backend : création/ownership/self/non-ami, transitions/expiration, snapshot conservé après édition/suppression originale, confidentialité audio/résultats, validation score/tentative/durée, idempotence, fin atomique, revanche/contre-défi/series/limite et contrôles HTTP/WebSocket. Tests navigateur : deux comptes, vraies prises MediaRecorder, résultat caché puis dévoilé, lecture, bonne bibliothèque de contre-défi, nouvelles performances par round, caméra WebRTC locale/reconnexion, refus caméra, Phone Micro et responsive deux thèmes.

Les suites existantes couvrent le player, les paroles, Lyrics Studio, le scoring, la bibliothèque, les performances, profils, auth UI et Phone Micro. Les services externes Spleeter, Whisper, LRCLIB et Basic Pitch ne sont pas relancés par ces tests ; leur pipeline n’a pas été modifié. Pas de test physique de deux appareils/réseaux, ni de simulation de congestion WAN.

### Test physique conseillé

1. Ouvrir la même URL HTTPS sur deux appareils, avec deux comptes amis. Configurer FRONTEND_URL / PHONE_MIC_PUBLIC_URL / origines autorisées pour cette URL.
2. Importer un morceau en mode Perfect Pitch, créer un défi et accepter sur le deuxième compte.
3. Effectuer la première prise, déconnecter ce compte, puis effectuer la seconde : vérifier que les deux résultats n’apparaissent qu’à la fin.
4. Réécouter les deux voix avec l’instrumental, tester pause, progression et volumes ; tenter l’URL avec un troisième compte (accès refusé).
5. Créer une revanche puis un contre-défi depuis l’autre bibliothèque, vérifier l’historique.
6. Réunir les deux comptes sur une room acceptée, activer les caméras de chaque côté. Désactiver/reconnecter une caméra pendant un karaoké : la prise doit continuer.
7. Sélectionner Téléphone pour une prise, scanner le QR, autoriser sur le PC, puis Enregistrer/Lecture. Vérifier le message d’enregistrement sur le téléphone. Une prise défi interrompue n’est pas soumise comme round complet.
8. Tester Wi-Fi contre réseau mobile. En cas d’échec uniquement entre réseaux, vérifier le serveur TURN partagé avec Phone Micro.

## Fichiers

Créés :

- `backend/services/challengeStore.js`, `challengeStore.test.js` ; `backend/routes/challenges.js`.
- `frontend/src/hooks/useChallenges.js` ; `components/ChallengesPage.jsx`, `ChallengesPage.css`, `ChallengeCamera.jsx`.
- `frontend/playwright.challenge.config.js` ; `tests/challengeDevServer.mjs` ; `tests/challenges/challenges.spec.js`.
- Ce rapport.

Modifiés pour cette mission :

- `backend/server.js`, `backend/services/phoneMicServer.js`, `backend/package.json`, `backend/.env.example`.
- `frontend/src/StudioApp.jsx`, `components/Player.jsx`, `components/PerfectPitchPanel.jsx`, `hooks/usePerfectPitchScoring.js`, `hooks/usePerformanceRecording.js`.
- `frontend/vite.config.js`, `frontend/package.json`, `frontend/playwright.config.js`, `tests/redesign.spec.js`, `tests/phoneMicDevServer.mjs`, `tests/phone/phoneMic.spec.js`.

Aucune dépendance ajoutée pour cette mission. Les autres modifications déjà présentes dans le worktree sont conservées. Aucun commit ni push.

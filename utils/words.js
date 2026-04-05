const wordCategories = {
    "Animaux": [
        { normal: "Chien", imposter: "Loup", hint: "Aboie" },
        { normal: "Tigre", imposter: "Lion", hint: "Félin rayé" },
        { normal: "Chat", imposter: "Lapin", hint: "Moustaches" },
        { normal: "Aigle", imposter: "Faucon", hint: "Oiseau de proie" },
        { normal: "Cheval", imposter: "Âne", hint: "Sabots" },
        { normal: "Requin", imposter: "Dauphin", hint: "Aileron" }
    ],
    "Lieux": [
        { normal: "Plage", imposter: "Piscine", hint: "Baignade" },
        { normal: "Cinéma", imposter: "Théâtre", hint: "Spectacle" },
        { normal: "Montagne", imposter: "Colline", hint: "Altitude" },
        { normal: "Bibliothèque", imposter: "Librairie", hint: "Livres" },
        { normal: "Restaurant", imposter: "Café", hint: "Nourriture" },
        { normal: "Hôpital", imposter: "Clinique", hint: "Soins" }
    ],
    "Objets": [
        { normal: "Voiture", imposter: "Camion", hint: "Roues" },
        { normal: "Piano", imposter: "Guitare", hint: "Instrument" },
        { normal: "Livre", imposter: "Magazine", hint: "Pages" },
        { normal: "Ordinateur", imposter: "Téléphone", hint: "Écran" },
        { normal: "Stylo", imposter: "Crayon", hint: "Écrire" },
        { normal: "Table", imposter: "Chaise", hint: "Meuble" }
    ],
    "Nourriture": [
        { normal: "Pomme", imposter: "Poire", hint: "Fruit" },
        { normal: "Café", imposter: "Thé", hint: "Boisson chaude" },
        { normal: "Lait", imposter: "Eau", hint: "Liquide" },
        { normal: "Chocolat", imposter: "Bonbon", hint: "Sucrerie" },
        { normal: "Pizza", imposter: "Burger", hint: "Fast-food" },
        { normal: "Fraise", imposter: "Framboise", hint: "Fruit rouge" }
    ],
    "Divers": [
        { normal: "Hiver", imposter: "Automne", hint: "Saison" },
        { normal: "Avion", imposter: "Hélicoptère", hint: "Voler" },
        { normal: "Facebook", imposter: "Instagram", hint: "Réseau social" },
        { normal: "Soleil", imposter: "Lune", hint: "Ciel" },
        { normal: "Nuit", imposter: "Jour", hint: "Temps" }
    ]
};

function getRandomWordPair(theme = 'random', playedWords = []) {
    let categoryKeys = Object.keys(wordCategories);
    let selectedTheme = theme;

    if (theme === 'random' || !wordCategories[theme]) {
        // Choisir un thème aléatoire qui a encore des mots disponibles
        let validThemes = categoryKeys.filter(key => {
            return wordCategories[key].some(pair => !playedWords.includes(pair.normal));
        });
        
        if (validThemes.length === 0) {
            return { error: true, errorType: 'all_exhausted', themeName: 'Tous' };
        }
        
        const randomThemeIndex = Math.floor(Math.random() * validThemes.length);
        selectedTheme = validThemes[randomThemeIndex];
    }

    const wordsList = wordCategories[selectedTheme];
    const availableWords = wordsList.filter(pair => !playedWords.includes(pair.normal));

    if (availableWords.length === 0) {
        return { error: true, errorType: 'theme_exhausted', themeName: selectedTheme };
    }

    const randomIndex = Math.floor(Math.random() * availableWords.length);
    const selectedPair = availableWords[randomIndex];
    
    return {
        wordPair: selectedPair,
        themeName: selectedTheme
    };
}

function getWordThemes() {
    return Object.keys(wordCategories);
}

module.exports = {
    wordCategories,
    getRandomWordPair,
    getWordThemes
};

import eslint from '@eslint/js';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
export default [{ignores:['dist/**']},{files:['**/*.{jsx,mjs}'],languageOptions:{parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},plugins:{react,'react-hooks':hooks,'jsx-a11y':a11y},rules:{...eslint.configs.recommended.rules,...a11y.configs.recommended.rules,'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','react/jsx-uses-vars':'error','react/jsx-uses-react':'error'}}];

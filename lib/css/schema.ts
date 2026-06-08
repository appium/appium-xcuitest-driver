import type {AttributeSchema} from '@appium/css-locator-to-native';

export const ATTRIBUTE_SCHEMA: AttributeSchema = {
  attributes: {
    visible: {type: 'boolean'},
    accessible: {type: 'boolean'},
    'accessibility-container': {type: 'boolean'},
    enabled: {type: 'boolean'},
    index: {type: 'numeric', aliases: ['nth-child']},
    label: {type: 'string'},
    name: {type: 'string', aliases: ['id']},
    value: {type: 'string'},
    type: {type: 'string'},
  },
  booleanFormat: 'zero-one',
};

// Selected ready assets, not requests to the paid model pipeline. Dimensions are metres after
// offline normalization. A support rectangle is an actual flat tabletop, not a bounding-box top.
export const LIBRARY_STOCK = {
  'reading-chair': {size:[1.544042,1.05,1.372482],file:'library/reading-chair-v1.glb'},
  'side-table': {size:[.75,.75,.75],file:'library/side-table-v1.glb',support:{height:.75,half:[.35,.35]}},
  books: {size:[.312,.2,.146],file:'library/books-v1.glb'},
  book: {size:[.104,.2,.146],file:'library/book-v1.glb'},
  'table-lamp': {size:[.33279,.34,.33279],file:'library/table-lamp-v1.glb',suggestedLight:{at:[0,.2,0],color:'#ffd49b',strength:.02}},
};

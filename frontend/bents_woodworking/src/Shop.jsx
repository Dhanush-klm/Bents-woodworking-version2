import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Button } from './components/ui/button'
import { Card, CardContent, CardFooter } from './components/ui/card'
import { Input } from './components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select'
import { Loader2, ExternalLink, Search } from 'lucide-react'

function ProductCard({ product }) {
  const imageUrl = product.image_data
    ? `data:image/jpeg;base64,${product.image_data}`
    : '/path/to/default/image.jpg';
  return (
    <Card className="w-full flex flex-col h-full bg-white rounded-[8px] border border-gray-300">
      <CardContent className="p-4 flex-grow flex flex-col">
        <div className="flex flex-col items-center mb-4">
          <div className="w-full h-48 flex items-center justify-center bg-white rounded-[8px] overflow-hidden mb-4">
            <img
              src={imageUrl}
              alt={product.title}
              className="max-w-full max-h-full object-contain rounded-[8px]"
            />
          </div>
          <h3 className="font-semibold text-lg text-center mb-2">{product.title}</h3>
        </div>
      </CardContent>
      <CardFooter className="mt-auto flex justify-center p-4">
        <a
          href={product.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center text-blue-500 hover:text-blue-600 text-sm font-medium"
        >
          View Product <ExternalLink size={12} className="ml-1" />
        </a>
      </CardFooter>
    </Card>
  );
}

export default function Shop() {
  const [products, setProducts] = useState([])
  const [groupedProducts, setGroupedProducts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOption, setSortOption] = useState('default')

  useEffect(() => {
    setLoading(true);
    const fetchProducts = async () => {
      try {
        const response = await axios.get(`https://bents-backend-server.vercel.app/api/products?sort=${sortOption}`);
        if (response.data.sortOption === 'video') {
          setGroupedProducts(response.data.groupedProducts);
          setProducts([]);
        } else {
          setProducts(response.data.products);
          setGroupedProducts({});
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching products:', error);
        setError('Failed to fetch products. Please try again later.');
        setLoading(false);
      }
    };
    fetchProducts();
  }, [sortOption]);

  const handleSearch = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleSort = (value) => {
    setLoading(true);
    setSortOption(value);
  };

  const filterProducts = (productsToFilter) => {
    return productsToFilter.filter(product =>
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.groupTags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };

  if (error) {
    return (
      <div className="text-center mt-8 text-red-500" role="alert">
        <p>{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-2 py-4 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-center mb-6">
          Recommended Products
        </h1>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="relative w-full sm:w-64">
            <Input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={handleSearch}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-[8px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          </div>
          <div className="w-48 sm:w-[200px] self-start sm:self-auto">
            <Select value={sortOption} onValueChange={handleSort}>
              <SelectTrigger className="w-full bg-white text-black rounded-[8px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className="bg-white border shadow-lg z-50 rounded-[8px]">
                <SelectItem value="default" className="text-black bg-white hover:bg-gray-100 cursor-pointer">
                  Sort by
                </SelectItem>
                <SelectItem value="video" className="text-black bg-white hover:bg-gray-100 cursor-pointer">
                  Sort by Video Title
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>
      <main>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : sortOption === 'video' ? (
          Object.entries(groupedProducts).map(([tag, products]) => (
            <div key={tag} className="mb-8">
              <h2 className="text-2xl font-bold mb-4">{tag}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filterProducts(products).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filterProducts(products).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
        {!loading && filterProducts(products).length === 0 && Object.keys(groupedProducts).length === 0 && (
          <p className="text-center text-gray-500 mt-8">No products found matching your search.</p>
        )}
      </main>
    </div>
  )
}
